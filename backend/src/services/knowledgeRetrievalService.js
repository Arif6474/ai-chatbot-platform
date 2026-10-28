const mongoose = require('mongoose');
const Tenant = require('../models/Tenant');
const BusinessContent = require('../models/BusinessContent');

const MAX_QUESTION_LENGTH = 500;
const MAX_DOCUMENTS = 5;
const MAX_CONTEXT_CHARACTERS = 6000;
const MAX_CANDIDATES = 100;

class KnowledgeRetrievalError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'KnowledgeRetrievalError';
    this.code = code;
  }
}

function validateTenantId(tenantId) {
  return typeof tenantId === 'string'
    && mongoose.Types.ObjectId.isValid(tenantId)
    && new mongoose.Types.ObjectId(tenantId).toString() === tenantId;
}

function tokenize(value) {
  return [...new Set((value.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || []))];
}

function scoreContent(content, terms) {
  const title = content.title.toLowerCase();
  const body = content.body.toLowerCase();
  return terms.reduce((score, term) => score + (title.includes(term) ? 3 : 0) + (body.includes(term) ? 1 : 0), 0);
}

function excerpt(value, remaining) {
  if (value.length <= remaining) return value;
  return `${value.slice(0, Math.max(0, remaining - 1)).trimEnd()}…`;
}

async function retrieveKnowledge({ tenantId, question }) {
  if (!validateTenantId(tenantId)) throw new KnowledgeRetrievalError('Invalid tenant ID', 'INVALID_ID');
  if (typeof question !== 'string' || question.trim().length === 0) throw new KnowledgeRetrievalError('Question is required', 'INVALID_QUESTION');
  if (question.trim().length > MAX_QUESTION_LENGTH) throw new KnowledgeRetrievalError('Question exceeds the maximum length', 'QUESTION_TOO_LONG');

  const tenantExists = await Tenant.exists({ _id: tenantId });
  if (!tenantExists) throw new KnowledgeRetrievalError('Tenant not found', 'TENANT_NOT_FOUND');

  const terms = tokenize(question.trim());
  const candidates = await BusinessContent.find({ tenantId, status: 'published' })
    .select({ title: 1, body: 1, createdAt: 1 })
    .sort({ createdAt: -1, _id: -1 })
    .limit(MAX_CANDIDATES)
    .lean();

  if (!candidates.length) return [];

  let ranked = candidates
    .map((content) => ({ content, score: scoreContent(content, terms) }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score
      || (new Date(right.content.createdAt || 0).getTime()) - (new Date(left.content.createdAt || 0).getTime())
      || String(right.content._id).localeCompare(String(left.content._id)));

  // If no specific terms matched (e.g. cross-language query like Bengali "service ki ki ache amk banglai bol"),
  // provide the tenant's published content so the multilingual model can answer using business facts
  if (!ranked.length && candidates.length > 0) {
    ranked = candidates.slice(0, MAX_DOCUMENTS).map((content) => ({ content, score: 1 }));
  }

  let remaining = MAX_CONTEXT_CHARACTERS;
  const results = [];
  for (const { content } of ranked) {
    if (results.length === MAX_DOCUMENTS || remaining <= 0) break;
    const title = excerpt(content.title, Math.min(remaining, 200));
    remaining -= title.length;
    if (remaining <= 0) break;
    const body = excerpt(content.body, remaining);
    remaining -= body.length;
    results.push({ title, body });
  }
  return results;
}

module.exports = { retrieveKnowledge, KnowledgeRetrievalError, MAX_QUESTION_LENGTH, MAX_DOCUMENTS, MAX_CONTEXT_CHARACTERS };
