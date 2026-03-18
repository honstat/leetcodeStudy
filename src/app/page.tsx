'use client';

import { useState, useEffect, useCallback } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { toast } from 'sonner';

interface Question {
  id: string;
  questionFrontendId: string;
  title: string;
  titleSlug: string;
  translatedTitle: string;
  difficulty: string;
  topicTags: Array<{
    name: string;
    nameTranslated: string;
    slug: string;
  }>;
}

interface GeneratedContent {
  code: string;
  testCases: string;
  summary: string;
}

interface AIConfig {
  apiUrl: string;
  apiKey: string;
  model: string;
  apiType?: 'anthropic' | 'openai';
}

export default function LeetCodeLearningPage() {
  const [language, setLanguage] = useState('js');
  const [selectedQuestion, setSelectedQuestion] = useState<Question | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [questionDetails, setQuestionDetails] = useState('');
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [generatedContent, setGeneratedContent] = useState<GeneratedContent | null>(null);
  const [generatingCode, setGeneratingCode] = useState(false);
  const [activeTab, setActiveTab] = useState('code');
  const [analysis, setAnalysis] = useState('');
  const [analyzingAnalysis, setAnalyzingAnalysis] = useState(false);
  const [skip, setSkip] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [difficulty, setDifficulty] = useState<string>('');
  
  // AI配置相关状态
  const [aiConfigOpen, setAiConfigOpen] = useState(false);
  const [aiConfig, setAiConfig] = useState<AIConfig>({ apiUrl: '', apiKey: '', model: '', apiType: 'anthropic' });
  const [testingConnection, setTestingConnection] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [hasAIConfig, setHasAIConfig] = useState(false);

  const fetchQuestions = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/leetcode', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: `
            query problemsetQuestionListV2($filters: QuestionFilterInput, $limit: Int, $searchKeyword: String, $skip: Int, $sortBy: QuestionSortByInput, $categorySlug: String) {
              problemsetQuestionListV2(
                filters: $filters
                limit: $limit
                searchKeyword: $searchKeyword
                skip: $skip
                sortBy: $sortBy
                categorySlug: $categorySlug
              ) {
                questions {
                  id
                  titleSlug
                  title
                  translatedTitle
                  questionFrontendId
                  paidOnly
                  difficulty
                  topicTags {
                    name
                    slug
                    nameTranslated
                  }
                  status
                  isInMyFavorites
                  frequency
                  acRate
                  contestPoint
                }
                totalLength
                finishedLength
                hasMore
              }
            }
          `,
          variables: {
            skip,
            limit: 100,
            categorySlug: "algorithms",
            filters: {
              filterCombineType: "ALL",
              statusFilter: {
                questionStatuses: [],
                operator: "IS"
              },
              difficultyFilter: {
                difficulties: difficulty ? [difficulty.toUpperCase()] : [],
                operator: "IS"
              },
              languageFilter: {
                languageSlugs: [],
                operator: "IS"
              },
              topicFilter: {
                topicSlugs: [],
                operator: "IS"
              },
              acceptanceFilter: {},
              frequencyFilter: {},
              frontendIdFilter: {},
              lastSubmittedFilter: {},
              publishedFilter: {},
              companyFilter: {
                companySlugs: [],
                operator: "IS"
              },
              positionFilter: {
                positionSlugs: [],
                operator: "IS"
              },
              contestPointFilter: {
                contestPoints: [],
                operator: "IS"
              },
              premiumFilter: {
                premiumStatus: [],
                operator: "IS"
              }
            },
            searchKeyword: "",
            sortBy: {
              sortField: "CUSTOM",
              sortOrder: "ASCENDING"
            }
          },
          operationName: "problemsetQuestionListV2"
        }),
      });

      const data = await response.json();
      if (data.data?.problemsetQuestionListV2?.questions) {
        setQuestions(data.data.problemsetQuestionListV2.questions);
        setHasMore(data.data.problemsetQuestionListV2.hasMore);
      }
    } catch (error) {
      console.error('Failed to fetch questions:', error);
    } finally {
      setLoading(false);
    }
  }, [skip, difficulty]);

  const fetchQuestionDetails = async (titleSlug: string) => {
    setLoadingDetails(true);
    try {
      const response = await fetch(`/api/leetcode/question?titleSlug=${titleSlug}`);
      const data = await response.json();

      if (data.description) {
        console.log('✓ Received description from backend');
        setQuestionDetails(data.description);
      } else if (data.error) {
        console.error('Backend error:', data.error);
        setQuestionDetails(`<div class="p-4 text-red-500">错误: ${data.error}</div>`);
      } else {
        setQuestionDetails('<div class="p-4 text-gray-500">未能解析到题目描述，请尝试其他题目</div>');
      }
    } catch (error) {
      console.error('Failed to fetch question details:', error);
      setQuestionDetails('<div class="p-4 text-red-500">加载题目详情失败</div>');
    } finally {
      setLoadingDetails(false);
    }
  };

  const generateCode = async () => {
    if (!selectedQuestion || !questionDetails) return;

    setGeneratingCode(true);
    setGeneratedContent(null);

    try {
      const response = await fetch('/api/leetcode/generate-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          questionTitle: selectedQuestion.translatedTitle || selectedQuestion.title,
          questionContent: questionDetails,
          language,
          optimization: false,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate code');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        let fullResponse = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          fullResponse += chunk;
        }

        // Try to parse JSON from the response
        try {
          console.log('[Frontend] Full response length:', fullResponse.length);
          console.log('[Frontend] Full response:', fullResponse); // 打印完整响应
          console.log('[Frontend] Response preview:', fullResponse.substring(0, 500));

          let parsed = null;
          let parseError = null;

          // 尝试多种JSON提取策略

          // 尝试多种JSON提取策略
          const strategies = [
            // 策略1: 智能提取JSON - 从{开始，计数匹配}
            () => {
              const firstBrace = fullResponse.indexOf('{');
              if (firstBrace === -1) return null;

              let braceCount = 0;
              let inString = false;
              let escapeNext = false;
              let endBrace = -1;

              for (let i = firstBrace; i < fullResponse.length; i++) {
                const char = fullResponse[i];

                if (escapeNext) {
                  escapeNext = false;
                  continue;
                }

                if (char === '\\') {
                  escapeNext = true;
                  continue;
                }

                if (char === '"') {
                  inString = !inString;
                  continue;
                }

                if (!inString) {
                  if (char === '{') {
                    braceCount++;
                  } else if (char === '}') {
                    braceCount--;
                    if (braceCount === 0) {
                      endBrace = i;
                      break;
                    }
                  }
                }
              }

              if (endBrace !== -1) {
                return fullResponse.substring(firstBrace, endBrace + 1);
              }
              return null;
            },
            // 策略2: 移除markdown代码块后提取
            () => {
              let cleaned = fullResponse
                .replace(/```json\s*/gi, '')
                .replace(/```[a-z]*\s*/gi, '')
                .replace(/```\s*/gi, '')
                .trim();
              const firstBrace = cleaned.indexOf('{');
              const lastBrace = cleaned.lastIndexOf('}');
              if (firstBrace !== -1 && lastBrace !== -1 && firstBrace < lastBrace) {
                return cleaned.substring(firstBrace, lastBrace + 1);
              }
              return null;
            },
            // 策略3: 直接提取第一个{到最后一个}
            () => {
              const firstBrace = fullResponse.indexOf('{');
              const lastBrace = fullResponse.lastIndexOf('}');
              if (firstBrace !== -1 && lastBrace !== -1 && firstBrace < lastBrace) {
                return fullResponse.substring(firstBrace, lastBrace + 1);
              }
              return null;
            },
            // 策略4: 使用正则匹配JSON对象（嵌套支持）
            () => {
              // 匹配可能包含嵌套的JSON
              const jsonMatch = fullResponse.match(/\{(?:[^{}]|(?:\{[^{}]*\}))*\}/);
              return jsonMatch ? jsonMatch[0] : null;
            }
          ];

          // 尝试所有策略
          for (let i = 0; i < strategies.length; i++) {
            const jsonStr = strategies[i]();
            if (jsonStr && jsonStr.length > 10) { // 至少要有一定长度
              console.log(`[Frontend] Strategy ${i + 1}: Extracted JSON, length:`, jsonStr.length);
              console.log(`[Frontend] Strategy ${i + 1}: JSON preview:`, jsonStr.substring(0, 300));
              try {
                parsed = JSON.parse(jsonStr);
                console.log('[Frontend] Parsed successfully, fields:', Object.keys(parsed));
                console.log('[Frontend] Parsed code type:', typeof parsed.code);

                // 验证必要的字段
                if (parsed.code !== undefined || parsed.testCases !== undefined || parsed.summary !== undefined) {
                  break;
                } else {
                  console.warn('[Frontend] Strategy parsed but no required fields');
                }
              } catch (parseErr) {
                parseError = parseErr;
                console.warn(`[Frontend] Strategy ${i + 1} parse failed:`, parseErr);
                console.warn(`[Frontend] Strategy ${i + 1} JSON that failed:`, jsonStr.substring(0, 500));
                continue;
              }
            }
          }

          // 检查解析结果 - 支持code字段为数组或字符串
          if (parsed && parsed.code !== undefined) {
            let codeStr = '';

            if (Array.isArray(parsed.code)) {
              // code是字符串数组，先检查是否有+号连接的情况
              const hasPlusConnection = parsed.code.some((line: string) => line.includes('" + "'));
              if (hasPlusConnection) {
                console.log('[Frontend] Detected + connection in code array, attempting to fix...');
                // 将所有数组元素用空格连接
                let fullCodeStr = parsed.code.join(' ');
                // 移除所有的 " + " 连接（处理变体："+", " + ", " +等）
                fullCodeStr = fullCodeStr.replace(/"\s*\+\s*"/g, '');

                // 根据代码特征重新分割成行
                // 在以下字符后添加换行：分号、{、}
                // 但要避免在字符串内部添加换行
                let lines: string[] = [];
                let currentLine = '';
                let inString = false;
                let escapeNext = false;

                for (let i = 0; i < fullCodeStr.length; i++) {
                  const char = fullCodeStr[i];

                  if (escapeNext) {
                    currentLine += char;
                    escapeNext = false;
                    continue;
                  }

                  if (char === '\\') {
                    currentLine += char;
                    escapeNext = true;
                    continue;
                  }

                  if (char === '"' || char === "'") {
                    currentLine += char;
                    inString = !inString;
                    continue;
                  }

                  currentLine += char;

                  // 在以下情况下换行（不在字符串内）
                  if (!inString && (char === ';' || char === '{' || char === '}')) {
                    lines.push(currentLine);
                    currentLine = '';
                  }
                }

                // 添加最后一行
                if (currentLine.trim()) {
                  lines.push(currentLine);
                }

                codeStr = lines.join('\n');
                console.log('[Frontend] Fixed code from + connection, lines:', lines.length);
              } else {
                // code是字符串数组，直接用\n连接
                codeStr = parsed.code.join('\n');
                console.log('[Frontend] Code is array, joined length:', codeStr.length);
              }
            } else if (typeof parsed.code === 'string') {
              // code是字符串，移除markdown标记
              codeStr = removeMarkdownCodeBlocks(parsed.code);
              console.log('[Frontend] Code is string, cleaned length:', codeStr.length);
            } else {
              console.error('[Frontend] Invalid code type:', typeof parsed.code);
              toast.error('代码格式错误，请重试');
              setGeneratedContent(null);
              return;
            }

            // 检查codeStr是否包含JSON对象结构（防止嵌套JSON）
            const hasJsonObject = codeStr.match(/\{\s*"code"\s*:/) ||
                                  codeStr.match(/\{\s*"testCases"\s*:/) ||
                                  codeStr.match(/\{\s*"summary"\s*:/);

            if (hasJsonObject) {
              console.error('[Frontend] Code contains JSON object structure, rejecting');
              console.error('[Frontend] Code preview:', codeStr.substring(0, 200));
              toast.error('代码格式错误，请重试');
              setGeneratedContent(null);
            } else {
              console.log('[Frontend] Successfully parsed, code length:', codeStr.length);
              setGeneratedContent({
                code: codeStr,
                testCases: parsed.testCases || '',
                summary: parsed.summary || '',
              });
            }
            return; // Success
          }

          // 解析失败：显示错误而不是原始响应
          console.error('[Frontend] JSON parsing failed');
          console.error('[Frontend] Parsed object:', parsed);
          console.error('[Frontend] Last parse error:', parseError);
          console.error('[Frontend] Full response length:', fullResponse.length);
          console.error('[Frontend] Full response preview:', fullResponse.substring(0, 1000));

          // 检查是否包含常见的错误模式
          if (fullResponse.includes('error')) {
            console.error('[Frontend] Response contains error keyword');
          }
          if (fullResponse.includes('Failed')) {
            console.error('[Frontend] Response contains Failed keyword');
          }

          toast.error(`代码生成失败，无法解析响应。请查看控制台了解详情`);
          setGeneratedContent(null);
        } catch (parseError) {
          console.error('[Frontend] Failed to parse JSON:', parseError);
          console.error('[Frontend] Parse error stack:', parseError instanceof Error ? parseError.stack : 'No stack');
          console.error('[Frontend] Full response preview:', fullResponse.substring(0, 1000));
          toast.error(`代码生成失败，JSON解析错误: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`);
          setGeneratedContent(null);
        }
      }
    } catch (error) {
      console.error('Failed to generate code:', error);
      console.error('Error stack:', error instanceof Error ? error.stack : 'No stack');
      toast.error(`代码生成失败: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setGeneratingCode(false);
    }
  };

  const copyCode = () => {
    if (!generatedContent?.code) return;
    // 复制时直接复制纯代码（已经去掉了markdown标记）
    navigator.clipboard.writeText(generatedContent.code);
    toast.success('代码已复制到剪贴板');
  };

  const generateAnalysis = async () => {
    if (!selectedQuestion || !questionDetails || !generatedContent?.code) return;

    setAnalyzingAnalysis(true);
    setAnalysis('');
    setActiveTab('analysis');

    try {
      const response = await fetch('/api/leetcode/analyze-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          questionTitle: selectedQuestion.translatedTitle || selectedQuestion.title,
          questionContent: questionDetails,
          code: generatedContent.code,
          language,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to analyze code');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        let fullResponse = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          fullResponse += chunk;
          // 实时更新解析内容
          setAnalysis(fullResponse);
        }
      }
    } catch (error) {
      console.error('Failed to analyze code:', error);
      toast.error('解析生成失败，请重试');
    } finally {
      setAnalyzingAnalysis(false);
    }
  };

  // 获取代码行数
  const getCodeLineCount = (code: string) => {
    return code.split('\n').length;
  };

  // 移除markdown代码块标记
  const removeMarkdownCodeBlocks = (text: string): string => {
    if (!text) return '';
    // 移除 ```language 和 ``` 标记（支持多种变体）
    return text
      .replace(/^```\w*\n?/gim, '')  // 移除开头的 ```language 或 ```
      .replace(/^```\n?/gim, '')     // 再次确保移除 ```
      .replace(/\n?```$/gim, '')     // 移除结尾的 ```
      .replace(/^```\w*$/gim, '')    // 移除单独的 ```language 行
      .trim();
  };

  // 加载AI配置
  const loadAIConfig = async () => {
    try {
      const response = await fetch('/api/config');
      const data = await response.json();
      if (data.config) {
        setAiConfig({
          apiUrl: data.config.apiUrl || '',
          apiKey: data.config.apiKey || '',
          model: data.config.model || '',
          apiType: data.config.apiType || 'anthropic'
        });
        setHasAIConfig(true);
      } else {
        setAiConfig({ apiUrl: '', apiKey: '', model: '', apiType: 'anthropic' });
        setHasAIConfig(false);
      }
    } catch (error) {
      console.error('Failed to load AI config:', error);
    }
  };

  // 测试AI连接
  const testConnection = async () => {
    if (!aiConfig.apiUrl || !aiConfig.apiKey || !aiConfig.model) {
      toast.error('请填写完整的配置信息');
      return;
    }

    setTestingConnection(true);
    try {
      const response = await fetch('/api/config/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(aiConfig),
      });
      const data = await response.json();
      if (data.success) {
        toast.success('连接成功');
      } else {
        toast.error(data.error || '连接失败');
      }
    } catch (error) {
      toast.error('连接测试失败');
    } finally {
      setTestingConnection(false);
    }
  };

  // 保存AI配置
  const saveAIConfig = async () => {
    if (!aiConfig.apiUrl || !aiConfig.apiKey || !aiConfig.model) {
      toast.error('请填写完整的配置信息');
      return;
    }

    setSavingConfig(true);
    try {
      const response = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(aiConfig),
      });
      const data = await response.json();
      if (data.success) {
        toast.success('配置保存成功');
        setHasAIConfig(true);
        setAiConfigOpen(false);
      } else {
        toast.error(data.error || '保存失败');
      }
    } catch (error) {
      toast.error('保存配置失败');
    } finally {
      setSavingConfig(false);
    }
  };

  // 清除AI配置
  const clearAIConfig = async () => {
    try {
      const response = await fetch('/api/config', { method: 'DELETE' });
      const data = await response.json();
      if (data.success) {
        toast.success('配置已清除');
        setAiConfig({ apiUrl: '', apiKey: '', model: '', apiType: 'anthropic' });
        setHasAIConfig(false);
      } else {
        toast.error(data.error || '清除失败');
      }
    } catch (error) {
      toast.error('清除配置失败');
    }
  };

  // 初始化加载AI配置
  useEffect(() => {
    loadAIConfig();
  }, []);

  const handleOpenChange = (open: boolean) => {
    setOpen(open);
    if (open && questions.length === 0) {
      fetchQuestions();
    }
  };

  const handleQuestionSelect = (question: Question) => {
    setSelectedQuestion(question);
    setQuestionDetails('');
    setGeneratedContent(null);
    fetchQuestionDetails(question.titleSlug);
    setOpen(false);
  };

  const handleNextPage = () => {
    setSkip(prev => prev + 100);
  };

  const handleDifficultyChange = (value: string) => {
    setDifficulty(value === 'ALL' ? '' : value);
    setSkip(0); // 重置分页
  };

  // 监听 skip 和 difficulty 变化，重新获取题目
  useEffect(() => {
    if (open) {
      fetchQuestions();
    }
  }, [skip, difficulty]);

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'Easy':
        return 'bg-green-500';
      case 'Medium':
        return 'bg-yellow-500';
      case 'Hard':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  return (
    <>
      <style>{`
        .leetcode-description {
          word-wrap: break-word;
          overflow-wrap: break-word;
        }
        .leetcode-description * {
          word-wrap: break-word;
          overflow-wrap: break-word;
        }
        .leetcode-description p {
          margin-bottom: 0.75rem;
          line-height: 1.6;
          word-wrap: break-word;
          overflow-wrap: break-word;
        }
        .leetcode-description h1,
        .leetcode-description h2,
        .leetcode-description h3,
        .leetcode-description h4,
        .leetcode-description h5,
        .leetcode-description h6 {
          margin-top: 1.25rem;
          margin-bottom: 0.5rem;
          font-weight: 600;
          word-wrap: break-word;
          overflow-wrap: break-word;
        }
        .leetcode-description pre {
          margin-bottom: 0.75rem;
          margin-top: 0.75rem;
          padding: 0.75rem;
          background-color: rgb(24, 24, 27);
          border-radius: 0.5rem;
          overflow-x: auto;
          white-space: pre-wrap;
          word-wrap: break-word;
          overflow-wrap: break-word;
        }
        .leetcode-description code {
          font-family: monospace;
          font-size: 0.8125rem;
          background-color: rgb(244, 244, 245);
          padding: 0.125rem 0.375rem;
          border-radius: 0.25rem;
          word-wrap: break-word;
          overflow-wrap: break-word;
        }
        .leetcode-description pre code {
          background-color: transparent;
          padding: 0;
          color: rgb(244, 244, 245);
          white-space: pre-wrap;
          word-wrap: break-word;
        }
        .leetcode-description ul,
        .leetcode-description ol {
          margin-bottom: 0.75rem;
          padding-left: 1.5rem;
          word-wrap: break-word;
        }
        .leetcode-description li {
          margin-bottom: 0.375rem;
          word-wrap: break-word;
          overflow-wrap: break-word;
        }
        .leetcode-description strong {
          font-weight: 600;
          display: inline-block;
          margin-top: 0.375rem;
          margin-bottom: 0.375rem;
        }
        .leetcode-description .section {
          margin-bottom: 1.5rem;
          padding-bottom: 1rem;
          border-bottom: 1px solid rgb(229, 231, 235);
          word-wrap: break-word;
        }
        .leetcode-description .example {
          margin: 1rem 0;
          padding: 0.75rem;
          background-color: rgb(249, 250, 251);
          border-left: 4px solid rgb(59, 130, 246);
          border-radius: 0.5rem;
          word-wrap: break-word;
          overflow-wrap: break-word;
        }
        .dark .leetcode-description pre {
          background-color: rgb(39, 39, 42);
        }
        .dark .leetcode-description code {
          background-color: rgb(39, 39, 42);
          color: rgb(228, 228, 231);
        }
        .dark .leetcode-description pre code {
          color: rgb(244, 244, 245);
        }
        .dark .leetcode-description .example {
          background-color: rgb(24, 24, 27);
          border-left-color: rgb(96, 165, 250);
        }
        .dark .leetcode-description .section {
          border-bottom-color: rgb(39, 39, 42);
        }
        @media (min-width: 640px) {
          .leetcode-description p {
            margin-bottom: 1rem;
            line-height: 1.7;
          }
          .leetcode-description h1,
          .leetcode-description h2,
          .leetcode-description h3,
          .leetcode-description h4,
          .leetcode-description h5,
          .leetcode-description h6 {
            margin-top: 1.5rem;
            margin-bottom: 0.75rem;
          }
          .leetcode-description pre {
            margin-bottom: 1rem;
            margin-top: 1rem;
            padding: 1rem;
          }
          .leetcode-description code {
            font-size: 0.875rem;
          }
          .leetcode-description ul,
          .leetcode-description ol {
            margin-bottom: 1rem;
            padding-left: 2rem;
          }
          .leetcode-description li {
            margin-bottom: 0.5rem;
          }
          .leetcode-description strong {
            margin-top: 0.5rem;
            margin-bottom: 0.5rem;
          }
          .leetcode-description .section {
            margin-bottom: 2rem;
            padding-bottom: 1.5rem;
          }
          .leetcode-description .example {
            margin: 1.5rem 0;
            padding: 1rem;
          }
        }
      `}</style>
      <div className="h-screen flex flex-col bg-white dark:bg-black overflow-hidden">
      {/* 顶部栏 */}
      <div className="flex items-center gap-2 sm:gap-4 p-2 sm:p-4 border-b flex-shrink-0">
        {/* 语言选择下拉框 */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <label htmlFor="language" className="text-xs sm:text-sm font-medium text-zinc-700 dark:text-zinc-300 hidden sm:block">
            实现语言:
          </label>
          <Select value={language} onValueChange={setLanguage}>
            <SelectTrigger className="w-[140px] sm:w-[180px] text-xs sm:text-sm">
              <SelectValue placeholder="选择语言" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="js">JavaScript</SelectItem>
              <SelectItem value="java">Java</SelectItem>
              <SelectItem value="go">Go</SelectItem>
              <SelectItem value="python">Python</SelectItem>
              <SelectItem value="c#">C#</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* 选择题目按钮 */}
        <Dialog open={open} onOpenChange={handleOpenChange}>
          <DialogTrigger asChild>
            <Button size="sm" className="flex-shrink-0">选择题目</Button>
          </DialogTrigger>
          <DialogContent className="max-w-[95vw] sm:max-w-4xl max-h-[90vh] sm:max-h-[80vh] w-[95vw] sm:w-auto">
            <DialogHeader>
              <DialogTitle className="text-base sm:text-lg">选择LeetCode题目</DialogTitle>
            </DialogHeader>
            
            {/* 难度筛选 */}
            <div className="flex items-center gap-2 flex-shrink-0 pb-2">
              <label htmlFor="difficulty" className="text-xs sm:text-sm font-medium text-zinc-700 dark:text-zinc-300">
                难度:
              </label>
              <Select value={difficulty || 'ALL'} onValueChange={handleDifficultyChange}>
                <SelectTrigger className="w-[120px] sm:w-[140px] text-xs sm:text-sm">
                  <SelectValue placeholder="全部" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">全部</SelectItem>
                  <SelectItem value="EASY">简单</SelectItem>
                  <SelectItem value="MEDIUM">中等</SelectItem>
                  <SelectItem value="HARD">困难</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-xs text-zinc-500">
                共 {questions.length} 道题
              </span>
            </div>
            
            <ScrollArea className="h-[60vh]">
              {loading ? (
                <div className="flex items-center justify-center p-8">
                  <div className="text-zinc-500">加载中...</div>
                </div>
              ) : (
                <div className="space-y-2 p-2">
                  {questions.map((question) => (
                    <div
                      key={question.id}
                      className="p-3 sm:p-4 border rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-900 cursor-pointer transition-colors"
                      onClick={() => handleQuestionSelect(question)}
                    >
                      <div className="flex items-start justify-between gap-2 sm:gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 sm:gap-3 mb-1 sm:mb-2">
                            <span className="font-mono text-xs sm:text-sm text-zinc-500 flex-shrink-0">
                              {question.questionFrontendId}.
                            </span>
                            <span className="font-semibold text-sm sm:text-base text-zinc-900 dark:text-zinc-100">
                              {question.translatedTitle || question.title}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1 sm:gap-2">
                            <Badge className={`${getDifficultyColor(question.difficulty)} text-xs sm:text-sm`}>
                              {question.difficulty}
                            </Badge>
                            {question.topicTags.slice(0, 3).map((tag) => (
                              <Badge key={tag.slug} variant="outline" className="text-xs sm:text-sm">
                                {tag.nameTranslated || tag.name}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
            
            {/* 分页按钮 */}
            <div className="flex items-center justify-between pt-2 border-t">
              <span className="text-xs text-zinc-500">
                当前页: {skip / 100 + 1}
              </span>
              <Button
                onClick={handleNextPage}
                disabled={!hasMore || loading}
                variant="outline"
                size="sm"
                className="text-xs sm:text-sm"
              >
                下一页
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* AI配置按钮 */}
        <Dialog open={aiConfigOpen} onOpenChange={setAiConfigOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" className="flex-shrink-0">
              AI配置 {hasAIConfig && '✓'}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>AI配置</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-xs sm:text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1 block">
                  API 类型
                </label>
                <Select 
                  value={aiConfig.apiType || 'anthropic'} 
                  onValueChange={(value) => setAiConfig({ ...aiConfig, apiType: value as 'anthropic' | 'openai' })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="选择 API 类型" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="anthropic">Anthropic 兼容（智谱/中转站）</SelectItem>
                    <SelectItem value="openai">OpenAI 兼容</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-zinc-500 mt-1">
                  {aiConfig.apiType === 'anthropic' 
                    ? '使用 x-api-key 认证，支持智谱 GLM、Claude 中转站等' 
                    : '使用 Bearer Token 认证，支持 OpenAI、DeepSeek 等'}
                </p>
              </div>
              <div>
                <label className="text-xs sm:text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1 block">
                  API URL
                </label>
                <input
                  type="text"
                  placeholder={aiConfig.apiType === 'anthropic' 
                    ? '例如: http://xxx:3300/api 或 https://open.bigmodel.cn/api/anthropic' 
                    : '例如: https://api.openai.com/v1/chat/completions'}
                  value={aiConfig.apiUrl}
                  onChange={(e) => setAiConfig({ ...aiConfig, apiUrl: e.target.value })}
                  className="w-full px-3 py-2 text-xs sm:text-sm border rounded-md bg-white dark:bg-zinc-800 dark:border-zinc-700"
                />
              </div>
              <div>
                <label className="text-xs sm:text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1 block">
                  API Key
                </label>
                <input
                  type="password"
                  placeholder="输入API密钥"
                  value={aiConfig.apiKey}
                  onChange={(e) => setAiConfig({ ...aiConfig, apiKey: e.target.value })}
                  className="w-full px-3 py-2 text-xs sm:text-sm border rounded-md bg-white dark:bg-zinc-800 dark:border-zinc-700"
                />
              </div>
              <div>
                <label className="text-xs sm:text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1 block">
                  模型名称
                </label>
                <input
                  type="text"
                  placeholder="例如: glm-5, gpt-4o, claude-3-sonnet"
                  value={aiConfig.model}
                  onChange={(e) => setAiConfig({ ...aiConfig, model: e.target.value })}
                  className="w-full px-3 py-2 text-xs sm:text-sm border rounded-md bg-white dark:bg-zinc-800 dark:border-zinc-700"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={testConnection}
                  disabled={testingConnection}
                  className="text-xs sm:text-sm flex-1"
                >
                  {testingConnection ? '测试中...' : '测试连接'}
                </Button>
                <Button
                  size="sm"
                  onClick={saveAIConfig}
                  disabled={savingConfig}
                  className="text-xs sm:text-sm flex-1"
                >
                  {savingConfig ? '保存中...' : '保存配置'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* 清除配置按钮 */}
        <Button
          size="sm"
          variant="ghost"
          onClick={clearAIConfig}
          disabled={!hasAIConfig}
          className="flex-shrink-0 text-xs sm:text-sm"
        >
          清除配置
        </Button>
      </div>

      {/* 主内容区 - 使用flex-1自动填充剩余空间 */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {selectedQuestion && (
          <>
            {/* 题目信息 */}
            <div className="border-b p-2 sm:p-4 flex-shrink-0 bg-zinc-50 dark:bg-zinc-900">
              <div className="flex items-start sm:items-center gap-2 sm:gap-3 mb-2 sm:mb-3">
                <span className="font-mono text-sm sm:text-lg font-bold text-zinc-500 flex-shrink-0">
                  {selectedQuestion.questionFrontendId}.
                </span>
                <h2 className="text-sm sm:text-xl font-bold text-zinc-900 dark:text-zinc-100 flex-1">
                  {selectedQuestion.translatedTitle || selectedQuestion.title}
                </h2>
                <Badge className={`${getDifficultyColor(selectedQuestion.difficulty)} text-xs sm:text-sm flex-shrink-0`}>
                  {selectedQuestion.difficulty}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-1 sm:gap-2">
                {selectedQuestion.topicTags.map((tag) => (
                  <Badge key={tag.slug} variant="outline" className="text-xs sm:text-sm">
                    {tag.nameTranslated || tag.name}
                  </Badge>
                ))}
              </div>
            </div>

            {/* 题目详情 */}
            <div className="flex-1 overflow-auto p-2 sm:p-4">
              <div className="max-w-4xl mx-auto">
                <div className="flex items-center justify-between mb-2 sm:mb-3">
                  <h3 className="text-base sm:text-lg font-semibold text-zinc-900 dark:text-zinc-100">题目描述</h3>
                  {selectedQuestion && (
                    <Button
                      variant="outline"
                      size="sm"
                      asChild
                      className="text-xs sm:text-sm"
                    >
                      <a
                        href={`https://leetcode.cn/problems/${selectedQuestion.titleSlug}/`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        去答题
                      </a>
                    </Button>
                  )}
                </div>
                {loadingDetails ? (
                  <div className="flex items-center justify-center p-4 sm:p-8">
                    <div className="text-zinc-500 text-sm">加载题目详情中...</div>
                  </div>
                ) : questionDetails ? (
                  <div
                    className="leetcode-description prose prose-zinc dark:prose-invert max-w-none text-zinc-700 dark:text-zinc-300 prose-headings:mb-4 prose-p:mb-4 prose-pre:mb-6 prose-ul:mb-4 prose-ol:mb-4"
                    dangerouslySetInnerHTML={{ __html: questionDetails }}
                  />
                ) : null}
              </div>
            </div>

            {/* 代码生成区域 */}
            {selectedQuestion && questionDetails && (
              <div className="flex flex-col h-1/2 flex-shrink-0 border-t bg-zinc-50 dark:bg-zinc-900">
                {/* 按钮区 */}
                <div className="flex items-center gap-1 sm:gap-2 p-2 sm:p-4 border-b flex-shrink-0 flex-wrap">
                  <Button
                    onClick={generateCode}
                    disabled={generatingCode}
                    size="sm"
                    className="text-xs sm:text-sm"
                  >
                    {generatingCode ? '生成中...' : '生成代码'}
                  </Button>
                  {generatedContent && (
                    <>
                      <Button variant="ghost" size="sm" onClick={copyCode} className="text-xs sm:text-sm">
                        复制代码
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={generateAnalysis}
                        disabled={analyzingAnalysis}
                        className="text-xs sm:text-sm"
                      >
                        {analyzingAnalysis ? '生成中...' : '解题思路'}
                      </Button>
                    </>
                  )}
                </div>

                {/* Tabs 内容区 */}
                <div className="flex-1 overflow-hidden">
                  {generatedContent ? (
                    <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
                      <TabsList className="flex-shrink-0">
                        <TabsTrigger value="code" className="text-xs sm:text-sm">代码</TabsTrigger>
                        <TabsTrigger value="testCases" className="text-xs sm:text-sm">测试</TabsTrigger>
                        <TabsTrigger value="summary" className="text-xs sm:text-sm">总结</TabsTrigger>
                        <TabsTrigger value="analysis" className="text-xs sm:text-sm">解析</TabsTrigger>
                      </TabsList>

                      <div className="flex-1 overflow-auto">
                        <TabsContent value="code" className="m-0 h-full">
                          <div className="h-full bg-zinc-950 p-2 sm:p-4 overflow-auto">
                            <div className="flex h-full">
                              {/* 行号 */}
                              <div className="flex-shrink-0 pr-2 sm:pr-4 text-right select-none">
                                {Array.from({ length: getCodeLineCount(generatedContent.code) }, (_, i) => (
                                  <div key={i} className="text-xs sm:text-sm text-zinc-600 font-mono leading-6 sm:leading-7">
                                    {i + 1}
                                  </div>
                                ))}
                              </div>
                              {/* 代码 */}
                              <pre className="text-xs sm:text-sm text-zinc-100 whitespace-pre-wrap font-mono flex-1 leading-6 sm:leading-7">
                                {generatedContent.code}
                              </pre>
                            </div>
                          </div>
                        </TabsContent>

                        <TabsContent value="testCases" className="m-0 h-full">
                          <div className="h-full bg-zinc-50 dark:bg-zinc-900 p-2 sm:p-4 overflow-auto">
                            <div className="prose prose-sm dark:prose-invert max-w-none">
                              <pre className="whitespace-pre-wrap text-zinc-700 dark:text-zinc-300 text-xs sm:text-sm">
                                {generatedContent.testCases || '暂无测试用例'}
                              </pre>
                            </div>
                          </div>
                        </TabsContent>

                        <TabsContent value="summary" className="m-0 h-full">
                          <div className="h-full bg-zinc-50 dark:bg-zinc-900 p-2 sm:p-4 overflow-auto">
                            <div className="prose prose-sm dark:prose-invert max-w-none">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {generatedContent.summary || '暂无总结'}
                              </ReactMarkdown>
                            </div>
                          </div>
                        </TabsContent>

                        <TabsContent value="analysis" className="m-0 h-full">
                          <div className="h-full bg-zinc-50 dark:bg-zinc-900 p-2 sm:p-4 overflow-auto">
                            <div className="prose prose-sm dark:prose-invert max-w-none">
                              {analyzingAnalysis ? (
                                <div className="flex items-center justify-center h-full text-zinc-500">
                                  生成解析中...
                                </div>
                              ) : analysis ? (
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                  {analysis}
                                </ReactMarkdown>
                              ) : (
                                <div className="flex items-center justify-center h-full text-zinc-500">
                                  点击"解题思路"按钮生成详细解析
                                </div>
                              )}
                            </div>
                          </div>
                        </TabsContent>
                      </div>
                    </Tabs>
                  ) : (
                    <div className="flex items-center justify-center h-full text-zinc-500">
                      点击"生成代码"按钮开始
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
    </>
  );
}
