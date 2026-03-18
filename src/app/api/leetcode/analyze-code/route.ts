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

// 检测 API 类型
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
  try {
    const urlPath = new URL(config.apiUrl, 'http://localhost').pathname;
    if (urlPath.endsWith('/api') || urlPath === '/api') {
      return 'anthropic';
    }
  } catch {
    // URL 解析失败，继续使用默认检测
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
    const { questionTitle, questionContent, code, language } = await request.json();

    if (!questionContent || !code || !language) {
      return NextResponse.json(
        { error: 'questionContent, code and language are required' },
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

    const systemPrompt = `你是一个算法题解专家，擅长为初学者讲解代码和算法思路。

请针对题目和代码，提供详细的解析，要求小白也能看懂。

输出格式要求（必须严格遵守，只输出markdown格式的内容，不要JSON，不要其他任何内容）：

## 题目分析
[对题目要求的详细理解，用自己的话描述题目想要什么，输入是什么，输出是什么，有什么限制条件]

## 考点
[列出本题涉及的知识点和数据结构，例如：数组、链表、哈希表、双指针、动态规划等]

## 做题思路
[从0到1的完整思考过程，包括：
1. 如何想到使用这个算法/数据结构
2. 为什么这个方案可行
3. 有哪些关键步骤
4. 如何处理边界情况]

## 代码解析
[整体代码结构和设计思路，包括：
1. 函数的输入输出
2. 使用了什么数据结构
3. 整体的执行流程]

## 逐行解答
[对关键代码行的详细解释，说明每行代码的作用，小白也能理解]

## 总结
[简要总结这个解法的特点和适用场景]

非常重要：
- 只输出markdown内容，不要包含代码块标记
- 不要说"以下是解析"之类的引导语
- 不要输出JSON格式
- 内容要详细易懂，适合初学者学习`;

    const userPrompt = `请详细解析以下${languageName}代码：

题目：${questionTitle}

题目描述：
${questionContent}

代码：
\`\`\`${languageName}
${code}
\`\`\`

请提供详细的解析，小白也能看懂。`;

    // 如果有自定义配置，使用自定义API
    if (aiConfig && aiConfig.apiUrl && aiConfig.apiKey && aiConfig.model) {
      console.log('[Analyze Code] Using custom AI config:', aiConfig.model);
      
      const apiType = detectApiType(aiConfig);
      const isAnthropic = apiType === 'anthropic';
      const apiUrl = getApiUrl(aiConfig.apiUrl, isAnthropic);
      
      console.log('[Analyze Code] API type:', apiType, '(explicit:', aiConfig.apiType || 'auto-detect', ')');
      console.log('[Analyze Code] API URL:', apiUrl);

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
                temperature: 0.3,
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
              console.error('[Analyze Code] API Error:', errorText);
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
                  // Anthropic SSE 格式
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
                  // OpenAI SSE 格式
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
            console.error('[Analyze Code] Stream error:', error);
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
    console.log('[Analyze Code] Using default coze SDK');
    const config = new Config();
    const client = new LLMClient(config);

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: userPrompt },
    ];

    const stream = client.stream(messages, {
      model: 'doubao-seed-1-6-flash-250615',
      temperature: 0.3,
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
    console.error('Error analyzing code:', error);
    return NextResponse.json(
      { error: 'Failed to analyze code' },
      { status: 500 }
    );
  }
}