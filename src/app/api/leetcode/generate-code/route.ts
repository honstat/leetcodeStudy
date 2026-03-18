import { NextRequest, NextResponse } from 'next/server';
import { LLMClient, Config } from 'coze-coding-dev-sdk';
import fs from 'fs';
import path from 'path';

const CONFIG_FILE_PATH = path.join(process.cwd(), 'ai-config.json');

interface AIConfig {
  apiUrl: string;
  apiKey: string;
  model: string;
  apiType?: 'anthropic' | 'openai';  // 可选：显式指定 API 类型
}

// 读取配置
function readConfig(): AIConfig | null {
  try {
    if (fs.existsSync(CONFIG_FILE_PATH)) {
      const content = fs.readFileSync(CONFIG_FILE_PATH, 'utf-8');
      return JSON.parse(content);
    }
    return null;
  } catch (error) {
    console.error('Error reading config:', error);
    return null;
  }
}

// 检测是否为 Anthropic 兼容接口
function detectApiType(config: AIConfig): 'anthropic' | 'openai' {
  // 1. 优先使用配置中显式指定的类型
  if (config.apiType === 'anthropic' || config.apiType === 'openai') {
    return config.apiType;
  }
  
  // 2. 自动检测：URL 包含 /anthropic
  if (config.apiUrl.includes('/anthropic')) {
    return 'anthropic';
  }
  
  // 3. 自动检测：中转站常见模式（以 /api 结尾，通常是 Anthropic 兼容）
  const urlPath = new URL(config.apiUrl, 'http://localhost').pathname;
  if (urlPath.endsWith('/api') || urlPath === '/api') {
    return 'anthropic';
  }
  
  // 4. 默认为 OpenAI 兼容
  return 'openai';
}

// 获取正确的 API URL
function getApiUrl(configUrl: string, isAnthropic: boolean): string {
  if (isAnthropic) {
    // Anthropic 兼容接口需要 /v1/messages
    let url = configUrl;
    if (!url.endsWith('/v1/messages')) {
      // 移除末尾的斜杠
      url = url.replace(/\/+$/, '');
      // 检查是否已经有 /v1
      if (!url.endsWith('/v1')) {
        url = url + '/v1/messages';
      } else {
        url = url + '/messages';
      }
    }
    return url;
  }
  // OpenAI 兼容接口
  return configUrl;
}

export async function POST(request: NextRequest) {
  try {
    const { questionTitle, questionContent, language, optimization = false } = await request.json();

    if (!questionContent || !language) {
      return NextResponse.json(
        { error: 'questionContent and language are required' },
        { status: 400 }
      );
    }

    const aiConfig = readConfig();

    const languageMap: Record<string, string> = {
      js: 'JavaScript',
      java: 'Java',
      go: 'Go',
      python: 'Python',
      'c#': 'C#',
    };

    const languageName = languageMap[language] || language;

    const systemPrompt = `你是一个算法题解专家。请根据题目描述用${languageName}编写高质量的算法解决方案。

要求：
1. 代码要有清晰注释
2. 提供完整实现
3. 包含时间复杂度和空间复杂度分析

输出格式要求（必须严格遵守，只输出JSON，不要其他任何内容）：

{
  "code": [
    "function solution() {",
    "  // 第一行代码",
    "  return result;",
    "}",
    "",
    "// 下一行代码"
  ],
  "testCases": "测试用例说明",
  "summary": "算法思路和复杂度分析总结（使用markdown格式）"
}

重要说明：
- code必须是字符串数组，数组的每个元素代表代码的一行
- 每一行代码（包括空行）都是数组中的一个独立元素
- 不要在数组元素内部用+号连接字符串
- 不要在数组元素内部用\\n换行
- 空行也必须是数组中的一个元素（空字符串""）
- 例如：["function test() {", "  console.log('hello');", "}"]
- 只输出JSON对象本身，不要包含markdown代码块标记`;

    const optimizationContext = optimization
      ? `\n\n请提供一个不同的、更优化的实现方案。要求：
1. 使用不同的算法或数据结构
2. 在代码注释中说明优化思路
3. 分析优化前后的对比
4. 提供优化的理由和适用场景`
      : '';

    const userPrompt = `请实现以下LeetCode题目的${languageName}解决方案：

题目：${questionTitle}

题目描述：
${questionContent}${optimizationContext}

直接输出JSON，不要其他内容。`;

    // 如果有自定义配置，使用自定义API
    if (aiConfig && aiConfig.apiUrl && aiConfig.apiKey && aiConfig.model) {
      console.log('[Generate Code] Using custom AI config:', aiConfig.model);
      
      const apiType = detectApiType(aiConfig);
      const isAnthropic = apiType === 'anthropic';
      const apiUrl = getApiUrl(aiConfig.apiUrl, isAnthropic);
      
      console.log('[Generate Code] API type:', apiType, '(explicit:', aiConfig.apiType || 'auto-detect', ')');
      console.log('[Generate Code] API URL:', apiUrl);

      const encoder = new TextEncoder();
      const readableStream = new ReadableStream({
        async start(controller) {
          try {
            // 根据API类型构建请求
            let requestBody: Record<string, unknown>;
            let headers: Record<string, string>;

            if (isAnthropic) {
              // Anthropic 兼容接口格式
              headers = {
                'Content-Type': 'application/json',
                'x-api-key': aiConfig.apiKey,
                'anthropic-version': '2023-06-01',
              };
              requestBody = {
                model: aiConfig.model,
                max_tokens: 4096,
                stream: true,
                system: systemPrompt,
                messages: [
                  { role: 'user', content: userPrompt }
                ],
              };
            } else {
              // OpenAI 兼容接口格式
              headers = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${aiConfig.apiKey}`,
              };
              requestBody = {
                model: aiConfig.model,
                messages: [
                  { role: 'system', content: systemPrompt },
                  { role: 'user', content: userPrompt }
                ],
                temperature: 0.1,
                stream: true,
              };
            }

            const response = await fetch(apiUrl, {
              method: 'POST',
              headers,
              body: JSON.stringify(requestBody),
            });

            if (!response.ok) {
              const errorText = await response.text();
              console.error('[Generate Code] API Error:', errorText);
              controller.error(new Error(`API Error: ${errorText}`));
              return;
            }

            const reader = response.body?.getReader();
            const decoder = new TextDecoder();

            if (!reader) {
              controller.error(new Error('No response body'));
              return;
            }

            let buffer = '';

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';

              for (const line of lines) {
                const trimmedLine = line.trim();
                if (!trimmedLine) continue;

                if (isAnthropic) {
                  // Anthropic SSE 格式: "event: xxx\ndata: {...}"
                  if (trimmedLine.startsWith('data: ')) {
                    const data = trimmedLine.slice(6).trim();
                    if (data === '[DONE]' || !data) continue;
                    
                    try {
                      const json = JSON.parse(data);
                      
                      // Anthropic 格式: content_block_delta
                      if (json.type === 'content_block_delta' && json.delta?.type === 'text_delta') {
                        const content = json.delta.text || '';
                        if (content) {
                          controller.enqueue(encoder.encode(content));
                        }
                      }
                      // 兼容其他可能的格式
                      else if (json.choices?.[0]?.delta?.content) {
                        controller.enqueue(encoder.encode(json.choices[0].delta.content));
                      }
                    } catch {
                      // 忽略解析错误
                    }
                  }
                } else {
                  // OpenAI SSE 格式: "data: {...}"
                  if (trimmedLine.startsWith('data: ')) {
                    const data = trimmedLine.slice(6).trim();
                    if (data === '[DONE]') continue;
                    
                    try {
                      const json = JSON.parse(data);
                      const content = json.choices?.[0]?.delta?.content || '';
                      if (content) {
                        controller.enqueue(encoder.encode(content));
                      }
                    } catch {
                      // 忽略解析错误
                    }
                  }
                }
              }
            }

            controller.close();
          } catch (error) {
            console.error('[Generate Code] Stream error:', error);
            controller.error(error);
          }
        },
      });

      return new NextResponse(readableStream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Transfer-Encoding': 'chunked',
        },
      });
    }

    // 使用默认的 coze SDK
    console.log('[Generate Code] Using default coze SDK');
    const config = new Config();
    const client = new LLMClient(config);

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: userPrompt },
    ];

    const stream = client.stream(messages, {
      model: 'doubao-seed-1-6-flash-250615',
      temperature: 0.1,
    });

    // Create a readable stream
    const encoder = new TextEncoder();
    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            if (chunk.content) {
              const content = chunk.content.toString();
              controller.enqueue(encoder.encode(content));
            }
          }
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });

    return new NextResponse(readableStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Transfer-Encoding': 'chunked',
      },
    });
  } catch (error) {
    console.error('Error generating code:', error);
    return NextResponse.json(
      { error: 'Failed to generate code' },
      { status: 500 }
    );
  }
}