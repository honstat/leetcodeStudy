import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const CONFIG_FILE_PATH = path.join(process.cwd(), 'ai-config.json');

interface AIConfig {
  apiUrl: string;
  apiKey: string;
  model: string;
  apiType?: 'anthropic' | 'openai';
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

// 写入配置
function writeConfig(config: AIConfig): boolean {
  try {
    fs.writeFileSync(CONFIG_FILE_PATH, JSON.stringify(config, null, 2), 'utf-8');
    return true;
  } catch (error) {
    console.error('Error writing config:', error);
    return false;
  }
}

// 清除配置
function clearConfig(): boolean {
  try {
    if (fs.existsSync(CONFIG_FILE_PATH)) {
      fs.unlinkSync(CONFIG_FILE_PATH);
    }
    return true;
  } catch (error) {
    console.error('Error clearing config:', error);
    return false;
  }
}

// GET - 获取配置
export async function GET() {
  const config = readConfig();
  return NextResponse.json({ config });
}

// POST - 保存配置
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { apiUrl, apiKey, model, apiType } = body;

    if (!apiUrl || !apiKey || !model) {
      return NextResponse.json(
        { error: 'apiUrl, apiKey and model are required' },
        { status: 400 }
      );
    }

    const config: AIConfig = { 
      apiUrl, 
      apiKey, 
      model,
      apiType: apiType || 'anthropic'
    };
    
    const success = writeConfig(config);
    if (success) {
      return NextResponse.json({ success: true, message: '配置保存成功' });
    } else {
      return NextResponse.json(
        { error: '保存配置失败' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Error saving config:', error);
    return NextResponse.json(
      { error: '保存配置失败' },
      { status: 500 }
    );
  }
}

// DELETE - 清除配置
export async function DELETE() {
  const success = clearConfig();
  if (success) {
    return NextResponse.json({ success: true, message: '配置已清除' });
  } else {
    return NextResponse.json(
      { error: '清除配置失败' },
      { status: 500 }
    );
  }
}