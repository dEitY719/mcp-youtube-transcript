import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";

// Types
export interface Transcript {
  text: string;     // Transcript text
  lang?: string;    // Language code
  timestamp: number; // Start time in seconds
  duration: number;  // Duration in seconds
}

export interface TranscriptOptions {
  videoID: string;  // Video ID or URL
  lang?: string;    // Language code, default 'en'
}

// Constants
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';
const ADDITIONAL_HEADERS = {
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9'
};

// Error handling
export class YouTubeTranscriptError extends McpError {
  constructor(message: string) {
    super(ErrorCode.InternalError, message);
    this.name = 'YouTubeTranscriptError';
  }
}

// Utility functions
export class YouTubeUtils {
  /**
   * Format time (convert seconds to readable format)
   */
  static formatTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);

    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
  }

  /**
   * Calculate total duration in seconds
   */
  static calculateTotalDuration(items: Transcript[]): number {
    return items.reduce((acc, item) => Math.max(acc, item.timestamp + item.duration), 0);
  }

  /**
   * Decode HTML entities
   */
  static decodeHTML(text: string): string {
    const entities: { [key: string]: string } = {
      '&amp;': '&',
      '&lt;': '<',
      '&gt;': '>',
      '&quot;': '"',
      '&#39;': "'",
      '&apos;': "'",
      '&#x27;': "'",
      '&#x2F;': '/',
      '&#x2f;': '/',
      '&#47;': '/',
      '&#xa0;': ' ',
      '&nbsp;': ' '
    };

    return text.replace(/&[^;]+;/g, match => entities[match] || match).trim();
  }

  /**
   * Normalize text formatting (punctuation and spaces)
   */
  static normalizeText(text: string): string {
    return text
      .replace(/\n/g, ' ')
      .replace(/\s*\.\s*\.\s*/g, '. ') // Fix multiple dots
      .replace(/\s*\.\s+/g, '. ')      // Normalize spaces after dots
      .replace(/\s+/g, ' ')            // Normalize spaces
      .replace(/\s+([,.])/g, '$1')     // Fix spaces before punctuation
      .replace(/\s*\?\s*/g, '? ')      // Normalize question marks
      .replace(/\s*!\s*/g, '! ')       // Normalize exclamation marks
      .trim();
  }

  /**
   * Format transcript text with optional paragraph breaks
   */
  static formatTranscriptText(
    transcripts: Transcript[],
    options: {
      enableParagraphs?: boolean;
      timeGapThreshold?: number;
      maxSentencesPerParagraph?: number;
    } = {}
  ): string {
    const {
      enableParagraphs = false,
      timeGapThreshold = 2,
      maxSentencesPerParagraph = 5
    } = options;

    // Process each transcript text
    const processedTranscripts = transcripts
      .map(transcript => this.decodeHTML(transcript.text))
      .filter(text => text.length > 0);

    if (!enableParagraphs) {
      // Simple concatenation mode with normalized formatting
      return this.normalizeText(processedTranscripts.join(' '));
    }

    // Paragraph mode
    const paragraphs: string[] = [];
    let currentParagraph: string[] = [];
    let lastEndTime = 0;

    for (let i = 0; i < transcripts.length; i++) {
      const transcript = transcripts[i];
      const text = this.decodeHTML(transcript.text.trim());
      if (!text) continue;

      const timeGap = transcript.timestamp - lastEndTime;
      const previousText = currentParagraph[currentParagraph.length - 1] || '';

      const shouldStartNewParagraph = 
        timeGap > timeGapThreshold ||
        (previousText.endsWith('.') && /^[A-Z]/.test(text)) ||
        currentParagraph.length >= maxSentencesPerParagraph;

      if (shouldStartNewParagraph && currentParagraph.length > 0) {
        paragraphs.push(this.normalizeText(currentParagraph.join(' ')));
        currentParagraph = [];
      }

      currentParagraph.push(text);
      lastEndTime = transcript.timestamp + transcript.duration;
    }

    if (currentParagraph.length > 0) {
      paragraphs.push(this.normalizeText(currentParagraph.join(' ')));
    }

    return paragraphs.join('\n\n');
  }
}

const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

// Utility function for delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Rate limit error detection
const isRateLimitError = (html: string): boolean => {
  return html.includes('class="g-recaptcha"') || 
         html.includes('sorry/index') ||
         html.includes('consent.youtube.com');
};

// Main YouTube functionality
export class YouTubeTranscriptFetcher {
  /**
   * Fetch video title using oEmbed API
   */
  private static async fetchVideoTitle(videoId: string): Promise<string> {
    try {
      const response = await fetch(
        `https://www.youtube.com/oembed?url=http://www.youtube.com/watch?v=${videoId}&format=json`
      );
      if (!response.ok) {
        throw new Error(`Failed to fetch video title (HTTP ${response.status})`);
      }
      const data = await response.json();
      return YouTubeUtils.decodeHTML(data.title);
    } catch (error) {
      console.error(`Failed to fetch video title: ${error}`);
      return 'Untitled Video';
    }
  }

  private static async fetchWithRetry(
    url: string, 
    options: RequestInit,
    retries = MAX_RETRIES
  ): Promise<Response> {
    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response;
    } catch (error) {
      if (retries > 0) {
        console.warn(`Fetch failed, retrying... (${retries} attempts left)`);
        await delay(RETRY_DELAY);
        return this.fetchWithRetry(url, options, retries - 1);
      }
      throw error;
    }
  }

  /**
   * Fetch transcript configuration and content from YouTube video page
   */
  private static async fetchTranscriptConfigAndContent(videoId: string, lang?: string): Promise<{ baseUrl: string, languageCode: string, transcripts: Transcript[] }> {
    const headers = {
      ...ADDITIONAL_HEADERS,
      ...(lang && { 'Accept-Language': lang }),
      'User-Agent': USER_AGENT
    };

    try {
      const response = await this.fetchWithRetry(`https://www.youtube.com/watch?v=${videoId}`, { headers });
      const html = await response.text();

      if (isRateLimitError(html)) {
        throw new YouTubeTranscriptError(
          'YouTube rate limit detected. This could be due to:\n' +
          '1. Too many requests from your IP\n' +
          '2. YouTube requiring CAPTCHA verification\n' +
          '3. Regional restrictions\n' +
          'Try:\n' +
          '- Waiting a few minutes\n' +
          '- Using a different IP address\n' +
          '- Using a VPN service'
        );
      }

      // Debug log for development
      if (process.env.NODE_ENV === 'development') {
        console.warn('YouTube response length:', html.length);
        console.warn('Contains captions:', html.includes('"captions":'));
      }

      const splittedHTML = html.split('"captions":');

      if (splittedHTML.length <= 1) {
        // Try alternative parsing method
        const captionsMatch = html.match(/"playerCaptionsTracklistRenderer":\s*({[^}]+})/);
        if (captionsMatch) {
          try {
            const captionsData = JSON.parse(captionsMatch[1]);
            if (captionsData.captionTracks) {
              const tracks = captionsData.captionTracks;
              const selectedTrack = lang
                ? tracks.find((track: any) => track.languageCode === lang)
                : tracks[0];

              if (selectedTrack) {
                return this.fetchTranscriptContent(selectedTrack, lang);
              }
            }
          } catch (e) {
            console.error('Failed to parse alternative captions data:', e);
          }
        }

        if (!html.includes('"playabilityStatus":')) {
          throw new YouTubeTranscriptError(`Video ${videoId} is unavailable`);
        }
        throw new YouTubeTranscriptError(`Could not find transcript data for video ${videoId}. Response size: ${html.length}`);
      }

      try {
        const transcriptData = JSON.parse(splittedHTML[1].split(',"videoDetails')[0].replace('\n', ''));
        const transcripts = transcriptData?.playerCaptionsTracklistRenderer;

        if (!transcripts || !('captionTracks' in transcripts)) {
          throw new YouTubeTranscriptError(`No transcripts available for video ${videoId}`);
        }

        const tracks = transcripts.captionTracks as { languageCode: string; baseUrl: string }[];
        const availableLanguages = tracks.map((track) => track.languageCode).join(', ');
        console.error(`[transcripts] video=${videoId} availableLangs=[${availableLanguages}] requested=${lang ?? 'default'}`);
        if (lang && !tracks.some((track) => track.languageCode === lang)) {
          throw new YouTubeTranscriptError(
            `Language ${lang} not available for video ${videoId}. Available languages: ${availableLanguages}`
          );
        }

        const selectedTrack = lang
          ? tracks.find((track) => track.languageCode === lang)
          : tracks[0];

        if (!selectedTrack) {
          throw new YouTubeTranscriptError(`Could not find transcript track for video ${videoId}`);
        }

        let selectedFmt = 'auto';
        try {
          selectedFmt = new URL(selectedTrack.baseUrl).searchParams.get('fmt') ?? 'auto';
        } catch {
          selectedFmt = 'unknown';
        }
        console.error(`[transcripts] video=${videoId} selectedTrack=${selectedTrack.languageCode} fmt=${selectedFmt}`);

        // Fetch transcript content
        const transcriptResponse = await this.fetchTranscriptContent(selectedTrack, lang);

        return {
          baseUrl: selectedTrack.baseUrl,
          languageCode: selectedTrack.languageCode,
          transcripts: transcriptResponse.transcripts.sort((a, b) => a.timestamp - b.timestamp)
        };
      } catch (error) {
        if (error instanceof YouTubeTranscriptError) {
          throw error;
        }
        throw new YouTubeTranscriptError(`Failed to parse transcript data: ${(error as Error).message}`);
      }
    } catch (error) {
      if (error instanceof YouTubeTranscriptError) {
        throw error;
      }
      throw new YouTubeTranscriptError(
        `Failed to fetch transcript data: ${(error as Error).message}\n` +
        'This might be due to network issues or YouTube rate limiting.'
      );
    }
  }

  /**
   * Helper method to fetch transcript content
   */
  private static async fetchTranscriptContent(
    track: { languageCode: string; baseUrl: string },
    lang?: string
  ): Promise<{ baseUrl: string; languageCode: string; transcripts: Transcript[] }> {
    const headers = {
      ...ADDITIONAL_HEADERS,
      ...(lang && { 'Accept-Language': lang }),
      'User-Agent': USER_AGENT,
      'Referer': 'https://www.youtube.com/',
      'Origin': 'https://www.youtube.com'
    };

    const candidates = this.buildTranscriptUrlCandidates(track.baseUrl);
    console.error(`[transcripts] track=${track.languageCode} candidates=${candidates.map((candidate) => candidate.fmt).join(' -> ')}`);

    let lastSnippet = '';
    let lastError: Error | undefined;

    for (const candidate of candidates) {
      try {
        const fmtLabel = candidate.fmt;
        const response = await this.fetchWithRetry(candidate.url, { headers });
        const body = await response.text();
        const trimmedPayload = body.trim();
        const jsonPayload = trimmedPayload.startsWith(")]}'")
          ? trimmedPayload.slice(4)
          : trimmedPayload;

        console.error(`[transcripts] attempt lang=${track.languageCode} fmt=${fmtLabel} payloadLength=${trimmedPayload.length}`);

        if (!trimmedPayload) {
          continue;
        }

        lastSnippet = trimmedPayload.slice(0, 200);

        if (jsonPayload.startsWith('{') || jsonPayload.startsWith('[')) {
          console.error(`[transcripts] track=${track.languageCode} fmt=${fmtLabel} payloadType=json`);
          const transcripts = this.parseJsonTranscriptPayload(jsonPayload, track.languageCode);
          console.error(`[transcripts] track=${track.languageCode} fmt=${fmtLabel} jsonSegments=${transcripts.length}`);
          if (transcripts.length > 0) {
            return {
              baseUrl: candidate.url,
              languageCode: track.languageCode,
              transcripts
            };
          }
          continue;
        }

        const transcripts = this.parseXmlTranscriptPayload(trimmedPayload, track.languageCode);
        console.error(`[transcripts] track=${track.languageCode} fmt=${fmtLabel} xmlSegments=${transcripts.length}`);
        if (transcripts.length > 0) {
          return {
            baseUrl: candidate.url,
            languageCode: track.languageCode,
            transcripts
          };
        }
      } catch (attemptError) {
        lastError = attemptError as Error;
        console.error(`[transcripts] track=${track.languageCode} attemptError=${(attemptError as Error).message}`);
      }
    }

    const fmtTried = candidates.map((candidate) => candidate.fmt).join(', ');
    const snippetInfo = lastSnippet ? ` payloadSnippet=${lastSnippet}` : '';

    if (lastError) {
      throw new YouTubeTranscriptError(
        `Failed to fetch transcript content after trying fmts=[${fmtTried}]: ${(lastError as Error).message}${snippetInfo ? `\n${snippetInfo}` : ''}`
      );
    }

    throw new YouTubeTranscriptError(
      `No transcripts found for track ${track.languageCode} after trying fmts=[${fmtTried}]${snippetInfo}`
    );
  }

  /**
   * Extract video ID from YouTube URL or direct ID input
   */
  static extractVideoId(input: string): string {
    if (!input) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'YouTube URL or ID is required'
      );
    }

    // If input is an 11-digit video ID
    if (/^[a-zA-Z0-9_-]{11}$/.test(input)) {
      return input;
    }

    // Handle URL formats
    try {
      const url = new URL(input);
      if (url.hostname === 'youtu.be') {
        return url.pathname.slice(1);
      } else if (url.hostname.includes('youtube.com')) {
        // Handle shorts URL format
        if (url.pathname.startsWith('/shorts/')) {
          return url.pathname.slice(8);
        }
        const videoId = url.searchParams.get('v');
        if (!videoId) {
          throw new McpError(
            ErrorCode.InvalidParams,
            `Invalid YouTube URL: ${input}`
          );
        }
        return videoId;
      }
    } catch (error) {
      // URL parsing failed, try regex matching
      const match = input.match(/(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/);
      if (match) {
        return match[1];
      }
    }

    throw new McpError(
      ErrorCode.InvalidParams,
      `Could not extract video ID from: ${input}`
    );
  }

  /**
   * Fetch transcripts and video information
   */
  static async fetchTranscripts(videoId: string, config?: { lang?: string }): Promise<{ transcripts: Transcript[], title: string }> {
    try {
      const identifier = this.extractVideoId(videoId);
      const [{ transcripts }, title] = await Promise.all([
        this.fetchTranscriptConfigAndContent(identifier, config?.lang),
        this.fetchVideoTitle(identifier)
      ]);
      
      return { transcripts, title };
    } catch (error) {
      if (error instanceof YouTubeTranscriptError || error instanceof McpError) {
        throw error;
      }
      throw new YouTubeTranscriptError(`Failed to fetch transcripts: ${(error as Error).message}`);
    }
  }

  /**
   * Parse JSON transcript payloads (fmt=json3)
   */
  private static parseJsonTranscriptPayload(payload: string, languageCode: string): Transcript[] {
    try {
      const data = JSON.parse(payload);
      const events = Array.isArray(data?.events) ? data.events : [];
      console.error(`[transcripts] parseJson events=${events.length}`);
      const transcripts: Transcript[] = [];

      for (const event of events) {
        const startMsValue = Number(event?.tStartMs ?? 0);
        const durationMsValue = Number(event?.dDurationMs ?? event?.tDurationMs ?? 0);
        const segs = Array.isArray(event?.segs) ? event.segs : [];
        const textFromSegs = segs.map((segment: any) => typeof segment?.utf8 === 'string' ? segment.utf8 : '').join('');
        const fallbackText = typeof event?.utf8 === 'string' ? event.utf8 : '';
        const rawText = textFromSegs || fallbackText;

        if (!rawText.trim()) {
          continue;
        }

        transcripts.push({
          text: YouTubeUtils.decodeHTML(rawText.trim()),
          lang: languageCode,
          timestamp: Number.isFinite(startMsValue) ? startMsValue / 1000 : 0,
          duration: Number.isFinite(durationMsValue) ? durationMsValue / 1000 : 0
        });
      }

      return transcripts.sort((a, b) => a.timestamp - b.timestamp);
    } catch (error) {
      console.error('[transcripts] failedJsonParse payloadSnippet=', payload.slice(0, 200));
      throw new YouTubeTranscriptError(`Failed to parse JSON transcript payload: ${(error as Error).message}`);
    }
  }

  /**
   * Parse XML transcript payloads
   */
  private static parseXmlTranscriptPayload(payload: string, languageCode: string): Transcript[] {
    const results: Transcript[] = [];
    const regex = /<text start="([^"]+)" dur="([^"]+)"[^>]*>([^<]*)<\/text>/g;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(payload)) !== null) {
      const start = parseFloat(match[1]);
      const duration = parseFloat(match[2]);
      const text = YouTubeUtils.decodeHTML(match[3]);

      if (!text.trim()) {
        continue;
      }

      results.push({
        text: text.trim(),
        lang: languageCode,
        timestamp: Number.isFinite(start) ? start : 0,
        duration: Number.isFinite(duration) ? duration : 0
      });
    }

    return results.sort((a, b) => a.timestamp - b.timestamp);
  }

  private static buildTranscriptUrlCandidates(baseUrl: string): { url: string; fmt: string }[] {
    const candidates: { url: string; fmt: string }[] = [];
    const seen = new Set<string>();

    const pushCandidate = (url: string, fmt: string) => {
      const normalizedUrl = url.trim();
      if (!normalizedUrl || seen.has(normalizedUrl)) {
        return;
      }
      seen.add(normalizedUrl);
      candidates.push({ url: normalizedUrl, fmt });
    };

    const baseFmt = this.extractFmtFromUrl(baseUrl) ?? 'auto';
    pushCandidate(baseUrl, baseFmt);

    const fallbackFmts: string[] = [];
    const ensureFmt = (fmt: string) => {
      if (!fallbackFmts.includes(fmt)) {
        fallbackFmts.push(fmt);
      }
    };

    ensureFmt('srv3');
    ensureFmt('json3');
    ensureFmt('srv1');

    for (const fmt of fallbackFmts) {
      if (fmt === baseFmt) {
        continue;
      }
      pushCandidate(this.updateUrlFmt(baseUrl, fmt), fmt);
    }

    return candidates;
  }

  private static extractFmtFromUrl(urlStr: string): string | undefined {
    try {
      const fmt = new URL(urlStr).searchParams.get('fmt');
      return fmt ?? undefined;
    } catch {
      const match = urlStr.match(/[?&]fmt=([^&]+)/);
      return match ? match[1] : undefined;
    }
  }

  private static updateUrlFmt(urlStr: string, fmt: string): string {
    try {
      const url = new URL(urlStr);
      url.searchParams.set('fmt', fmt);
      return url.toString();
    } catch {
      if (/[?&]fmt=/i.test(urlStr)) {
        return urlStr.replace(/([?&]fmt=)[^&]*/i, `$1${fmt}`);
      }
      const separator = urlStr.includes('?') ? '&' : '?';
      return `${urlStr}${separator}fmt=${fmt}`;
    }
  }
} 
