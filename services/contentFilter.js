// services/contentFilter.js
/**
 * Basic content filtering service for text-based content moderation.
 * This provides a simple word-based filter for obvious violations.
 * For production, consider integrating with a more sophisticated
 * content moderation API (e.g., AWS Rekognition, Google Cloud Vision).
 */

// Common profanity and offensive terms (basic list)
const BLOCKED_WORDS = [
  // Profanity (keeping list minimal for demonstration)
  "explicit-word-1",
  "explicit-word-2",
  // Add actual words as needed
];

// Patterns that might indicate spam
const SPAM_PATTERNS = [
  /buy\s+now/i,
  /click\s+here/i,
  /limited\s+time\s+offer/i,
  /act\s+now/i,
  /free\s+money/i,
  /make\s+\$?\d+/i,
  /earn\s+\$?\d+/i,
];

// Patterns for potential scam content
const SCAM_PATTERNS = [
  /send\s+(me\s+)?money/i,
  /wire\s+transfer/i,
  /western\s+union/i,
  /bitcoin\s+wallet/i,
  /crypto\s+wallet/i,
  /pay\s+outside/i,
  /contact\s+me\s+at/i,
];

/**
 * Check text for blocked words
 * @param {string} text - Text to check
 * @returns {Object} - { isClean, flaggedWords }
 */
export function checkForBlockedWords(text) {
  if (!text || typeof text !== "string") {
    return { isClean: true, flaggedWords: [] };
  }

  const lowerText = text.toLowerCase();
  const flaggedWords = BLOCKED_WORDS.filter((word) =>
    lowerText.includes(word.toLowerCase())
  );

  return {
    isClean: flaggedWords.length === 0,
    flaggedWords,
  };
}

/**
 * Check text for spam patterns
 * @param {string} text - Text to check
 * @returns {Object} - { isClean, matchedPatterns }
 */
export function checkForSpam(text) {
  if (!text || typeof text !== "string") {
    return { isClean: true, matchedPatterns: [] };
  }

  const matchedPatterns = SPAM_PATTERNS.filter((pattern) =>
    pattern.test(text)
  ).map((p) => p.toString());

  return {
    isClean: matchedPatterns.length === 0,
    matchedPatterns,
  };
}

/**
 * Check text for scam patterns
 * @param {string} text - Text to check
 * @returns {Object} - { isClean, matchedPatterns }
 */
export function checkForScam(text) {
  if (!text || typeof text !== "string") {
    return { isClean: true, matchedPatterns: [] };
  }

  const matchedPatterns = SCAM_PATTERNS.filter((pattern) =>
    pattern.test(text)
  ).map((p) => p.toString());

  return {
    isClean: matchedPatterns.length === 0,
    matchedPatterns,
  };
}

/**
 * Run all content checks on text
 * @param {string} text - Text to analyze
 * @returns {Object} - Combined results from all checks
 */
export function analyzeContent(text) {
  const blockedWordsResult = checkForBlockedWords(text);
  const spamResult = checkForSpam(text);
  const scamResult = checkForScam(text);

  const isClean =
    blockedWordsResult.isClean && spamResult.isClean && scamResult.isClean;

  const issues = [];
  if (!blockedWordsResult.isClean) {
    issues.push({
      type: "blocked_words",
      details: blockedWordsResult.flaggedWords,
    });
  }
  if (!spamResult.isClean) {
    issues.push({ type: "spam", details: spamResult.matchedPatterns });
  }
  if (!scamResult.isClean) {
    issues.push({ type: "scam", details: scamResult.matchedPatterns });
  }

  return {
    isClean,
    issues,
    riskLevel: isClean ? "low" : issues.length >= 2 ? "high" : "medium",
  };
}

/**
 * Sanitize text by replacing blocked words with asterisks
 * @param {string} text - Text to sanitize
 * @returns {string} - Sanitized text
 */
export function sanitizeText(text) {
  if (!text || typeof text !== "string") {
    return text;
  }

  let sanitized = text;
  BLOCKED_WORDS.forEach((word) => {
    const regex = new RegExp(word, "gi");
    sanitized = sanitized.replace(regex, "*".repeat(word.length));
  });

  return sanitized;
}

export default {
  checkForBlockedWords,
  checkForSpam,
  checkForScam,
  analyzeContent,
  sanitizeText,
};
