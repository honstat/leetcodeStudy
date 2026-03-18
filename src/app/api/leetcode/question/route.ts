import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const titleSlug = searchParams.get('titleSlug');

  if (!titleSlug) {
    return NextResponse.json(
      { error: 'titleSlug is required' },
      { status: 400 }
    );
  }

  try {
    const response = await fetch(`https://leetcode.cn/problems/${titleSlug}/`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const html = await response.text();

    // Use regex to extract description from the HTML
    let descriptionHTML = '';

    // Strategy 1: Find div with data-track-load="description_content"
    // This regex looks for the opening tag, captures content up to the closing tag
    const regex1 = /<div[^>]*data-track-load="description_content"[^>]*>([\s\S]*?)<\/div>/i;
    const match1 = html.match(regex1);
    if (match1 && match1[1]) {
      descriptionHTML = match1[1];
      console.log('[Backend] ✓ Strategy 1: Found description using data-track-load');
    }

    // Strategy 2: If strategy 1 failed, try finding the description content in meta tags
    if (!descriptionHTML) {
      // Look for JSON data embedded in the page
      const jsonRegex = /window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?});/i;
      const jsonMatch = html.match(jsonRegex);
      if (jsonMatch && jsonMatch[1]) {
        try {
          const initialState = JSON.parse(jsonMatch[1]);
          // Try to extract content from the initial state
          if (initialState?.questions?.all?.data?.[titleSlug]?.content) {
            descriptionHTML = initialState.questions.all.data[titleSlug].content;
            console.log('[Backend] ✓ Strategy 2: Found description in __INITIAL_STATE__');
          }
        } catch (e) {
          console.error('[Backend] Failed to parse __INITIAL_STATE__:', e);
        }
      }
    }

    // Strategy 3: Look for the meta description tag
    if (!descriptionHTML) {
      const metaRegex = /<meta name="description"[^>]*content="([^"]*)"[^>]*>/i;
      const metaMatch = html.match(metaRegex);
      if (metaMatch && metaMatch[1]) {
        // Decode HTML entities
        let text = metaMatch[1]
          .replace(/&quot;/g, '"')
          .replace(/&nbsp;/g, ' ')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&amp;/g, '&');

        // Convert text to HTML with proper formatting
        descriptionHTML = formatTextToHTML(text);
        console.log('[Backend] ✓ Strategy 3: Found description in meta tag and formatted to HTML');
      }
    }

    // Format the description HTML if it's just plain text
    if (descriptionHTML && !descriptionHTML.includes('<')) {
      descriptionHTML = formatTextToHTML(descriptionHTML);
      console.log('[Backend] ✓ Formatted plain text to HTML');
    }

    if (descriptionHTML) {
      return NextResponse.json({ description: descriptionHTML });
    } else {
      console.error('[Backend] ✗ All strategies failed');
      return NextResponse.json({
        error: 'Failed to parse question description',
        preview: html.substring(0, 1000)
      }, { status: 500 });
    }
  } catch (error) {
    console.error('[Backend] Error fetching question details:', error);
    return NextResponse.json(
      { error: 'Failed to fetch question details' },
      { status: 500 }
    );
  }
}

// Helper function to format plain text to HTML
function formatTextToHTML(text: string): string {
  // Normalize line endings
  text = text.replace(/\r\n/g, '\n');

  // Split into sections based on empty lines
  const sections = text.split(/\n\s*\n+/);

  let html = '';
  let inExampleSection = false;

  for (const section of sections) {
    const lines = section.trim().split('\n').map(l => l.trim()).filter(l => l);
    if (lines.length === 0) continue;

    const firstLine = lines[0];

    // Detect example header
    if (firstLine.match(/^示例\s*\d+：/)) {
      if (inExampleSection) {
        html += '</div>'; // Close previous example
      }
      html += `<div class="example"><p><strong>${firstLine}</strong></p>`;
      inExampleSection = true;
      continue;
    }

    // Detect section headers (提示, 进阶, etc.)
    if (firstLine.match(/^(提示|进阶|约束)：/)) {
      if (inExampleSection) {
        html += '</div>';
        inExampleSection = false;
      }
      html += `<div class="section"><p><strong>${firstLine}</strong></p>`;
      // Process remaining lines as bullet points if they start with *
      for (let i = 1; i < lines.length; i++) {
        if (lines[i].startsWith('*')) {
          html += `<p>${lines[i]}</p>`;
        } else {
          html += `<p>${lines[i]}</p>`;
        }
      }
      html += '</div>';
      continue;
    }

    // Regular content
    if (inExampleSection) {
      // Inside example section
      for (const line of lines) {
        if (line.match(/^(输入|输出|解释)：/)) {
          html += `<p><strong>${line}</strong></p>`;
        } else {
          html += `<p>${line}</p>`;
        }
      }
    } else {
      // Regular paragraph section
      html += `<div class="section">`;
      for (const line of lines) {
        html += `<p>${line}</p>`;
      }
      html += '</div>';
    }
  }

  // Close any open example section
  if (inExampleSection) {
    html += '</div>';
  }

  return html;
}
