import { NextRequest, NextResponse } from 'next/server';

interface TestConfig {
  apiUrl: string;
  apiKey: string;
  model: string;
  apiType?: 'anthropic' | 'openai';
}

// 检测 API 类型
function detectApiType(config: TestConfig): 'anthropic' | 'openai' {
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
    const { apiUrl, apiKey, model, apiType } = await request.json() as TestConfig;

    if (!apiUrl || !apiKey || !model) {
      return NextResponse.json(
        { error: 'apiUrl, apiKey and model are required' },
        { status: 400 }
      );
    }

    const config: TestConfig = { apiUrl, apiKey, model, apiType };
    const detectedApiType = detectApiType(config);
    const isAnthropic = detectedApiType === 'anthropic';
    const testApiUrl = getApiUrl(apiUrl, isAnthropic);
    
    console.log('[Config Test] API type:', detectedApiType, '(explicit:', apiType || 'auto-detect', ')');
    console.log('[Config Test] API URL:', testApiUrl);

    let headers: Record<string, string>;
    let requestBody: Record<string, unknown>;

    if (isAnthropic) {
      // Anthropic 兼容接口格式
      headers = {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      };
      requestBody = {
        model: model,
        max_tokens: 10,
        messages: [
          { role: 'user', content: 'Hi' }
        ],
      };
    } else {
      // OpenAI 兼容接口格式
      headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      };
      requestBody = {
        model: model,
        messages: [
          { role: 'user', content: 'Hi' }
        ],
        max_tokens: 10,
      };
    }

    // 测试连接
    const response = await fetch(testApiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
    });

    if (response.ok) {
      return NextResponse.json({ success: true, message: '连接成功', apiType: detectedApiType });
    } else {
      const errorText = await response.text();
      let errorMessage = '连接失败';
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error?.message || errorJson.message || errorMessage;
      } catch {
        errorMessage = errorText || errorMessage;
      }
      return NextResponse.json(
        { error: errorMessage },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('Error testing connection:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '连接失败' },
      { status: 500 }
    );
  }
}
