/**
 * Guardrails and Policy Enforcement System
 * Provides content filtering, rate limiting, and policy enforcement
 */

export class Guardrails {
  constructor(policies = {}) {
    this.policies = {
      // Content filtering
      blockHarmfulContent: policies.blockHarmfulContent !== false,
      blockSensitiveTopics: policies.blockSensitiveTopics !== false,
      
      // Rate limiting
      maxRequestsPerMinute: policies.maxRequestsPerMinute || 60,
      maxRequestsPerHour: policies.maxRequestsPerHour || 1000,
      
      // Tool restrictions
      allowedTools: policies.allowedTools || null, // null = all allowed
      blockedTools: policies.blockedTools || [],
      
      // Response filtering
      maxResponseLength: policies.maxResponseLength || 10000,
      blockPII: policies.blockPII !== false, // Personal Identifiable Information
      
      // Custom filters
      customFilters: policies.customFilters || [],
      
      ...policies,
    };
    
    // Rate limiting tracking
    this.rateLimitStore = new Map(); // sessionId -> { count, resetTime }
    
    // Harmful content patterns
    this.harmfulPatterns = [
      // Violence
      /\b(kill|murder|assassinate|violence|harm|hurt|attack)\b/gi,
      
      // Self-harm
      /\b(suicide|self.harm|end.life)\b/gi,
      
      // Illegal activities
      /\b(hack|steal|fraud|illegal|drugs|weapon)\b/gi,
      
      // Hate speech (basic patterns)
      /\b(hate|discriminate|racist|sexist)\b/gi,
      
      // Explicit content
      /\b(explicit|porn|nsfw|adult.content)\b/gi,
    ];
    
    // Sensitive topics
    this.sensitiveTopics = [
      /\b(classified|secret|confidential|top.secret)\b/gi,
      /\b(ssn|social.security|credit.card|password)\b/gi,
      /\b(api.key|access.token|private.key)\b/gi,
    ];
    
    // PII patterns
    this.piiPatterns = [
      /\b\d{3}-\d{2}-\d{4}\b/g, // SSN
      /\b\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\b/g, // Credit card
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, // Email
      /\b\d{3}-\d{3}-\d{4}\b/g, // Phone
    ];
  }

  /**
   * Check if content violates policies
   */
  validateContent(content, type = 'input') {
    const violations = [];
    
    if (!content || typeof content !== 'string') {
      return { valid: false, violations: ['Content must be a non-empty string'] };
    }

    // Check harmful content
    if (this.policies.blockHarmfulContent) {
      for (const pattern of this.harmfulPatterns) {
        if (pattern.test(content)) {
          violations.push(`Blocked harmful content pattern detected`);
          break;
        }
      }
    }

    // Check sensitive topics
    if (this.policies.blockSensitiveTopics) {
      for (const pattern of this.sensitiveTopics) {
        if (pattern.test(content)) {
          violations.push(`Blocked sensitive topic detected`);
          break;
        }
      }
    }

    // Check PII in output
    if (type === 'output' && this.policies.blockPII) {
      for (const pattern of this.piiPatterns) {
        if (pattern.test(content)) {
          violations.push(`Personal Identifiable Information (PII) detected in output`);
          break;
        }
      }
    }

    // Check response length
    if (type === 'output' && content.length > this.policies.maxResponseLength) {
      violations.push(`Response exceeds maximum length of ${this.policies.maxResponseLength} characters`);
    }

    // Custom filters
    for (const filter of this.policies.customFilters) {
      if (typeof filter === 'function') {
        const result = filter(content, type);
        if (result && !result.valid) {
          violations.push(result.reason || 'Custom filter violation');
        }
      }
    }

    return {
      valid: violations.length === 0,
      violations,
    };
  }

  /**
   * Check rate limiting
   */
  checkRateLimit(sessionId) {
    const now = Date.now();
    const record = this.rateLimitStore.get(sessionId) || { count: 0, resetTime: now + 60000 };
    
    // Reset if time window passed
    if (now > record.resetTime) {
      record.count = 0;
      record.resetTime = now + 60000; // 1 minute window
    }
    
    // Check limits
    if (record.count >= this.policies.maxRequestsPerMinute) {
      return {
        allowed: false,
        reason: `Rate limit exceeded: ${this.policies.maxRequestsPerMinute} requests per minute`,
        retryAfter: Math.ceil((record.resetTime - now) / 1000),
      };
    }
    
    // Increment counter
    record.count++;
    this.rateLimitStore.set(sessionId, record);
    
    return { allowed: true };
  }

  /**
   * Validate tool usage
   */
  validateTool(toolName) {
    // Check if tool is blocked
    if (this.policies.blockedTools.includes(toolName)) {
      return {
        allowed: false,
        reason: `Tool "${toolName}" is blocked by policy`,
      };
    }
    
    // Check if tool is in allowed list
    if (this.policies.allowedTools && !this.policies.allowedTools.includes(toolName)) {
      return {
        allowed: false,
        reason: `Tool "${toolName}" is not in the allowed tools list`,
      };
    }
    
    return { allowed: true };
  }

  /**
   * Sanitize output (remove PII, truncate, etc.)
   */
  sanitizeOutput(content) {
    let sanitized = content;
    
    // Remove PII if policy enabled
    if (this.policies.blockPII) {
      for (const pattern of this.piiPatterns) {
        sanitized = sanitized.replace(pattern, '[REDACTED]');
      }
    }
    
    // Truncate if too long
    if (sanitized.length > this.policies.maxResponseLength) {
      sanitized = sanitized.substring(0, this.policies.maxResponseLength) + '... [truncated]';
    }
    
    return sanitized;
  }

  /**
   * Get policy summary
   */
  getPolicySummary() {
    return {
      contentFiltering: {
        blockHarmfulContent: this.policies.blockHarmfulContent,
        blockSensitiveTopics: this.policies.blockSensitiveTopics,
        blockPII: this.policies.blockPII,
      },
      rateLimiting: {
        maxRequestsPerMinute: this.policies.maxRequestsPerMinute,
        maxRequestsPerHour: this.policies.maxRequestsPerHour,
      },
      toolRestrictions: {
        allowedTools: this.policies.allowedTools,
        blockedTools: this.policies.blockedTools,
      },
      responseLimits: {
        maxResponseLength: this.policies.maxResponseLength,
      },
    };
  }
}

/**
 * Default guardrails instance
 */
export const defaultGuardrails = new Guardrails();

/**
 * Create guardrails with custom policies
 */
export function createGuardrails(policies) {
  return new Guardrails(policies);
}

