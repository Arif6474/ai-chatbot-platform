const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Tenant = require('../src/models/Tenant');
const BusinessContent = require('../src/models/BusinessContent');
const { retrieveKnowledge, KnowledgeRetrievalError, MAX_DOCUMENTS, MAX_CONTEXT_CHARACTERS, MAX_QUESTION_LENGTH } = require('../src/services/knowledgeRetrievalService');

let mongoServer;
let tenant;
let otherTenant;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer?.stop();
});

beforeEach(async () => {
  await Promise.all([Tenant.deleteMany({}), BusinessContent.deleteMany({})]);
  tenant = await Tenant.create({ name: 'Acme Dental', slug: 'acme-dental' });
  otherTenant = await Tenant.create({ name: 'Other Dental', slug: 'other-dental' });
});

describe('knowledge retrieval service', () => {
  it('returns relevant published content only for the requested tenant', async () => {
    await BusinessContent.create([
      { tenantId: tenant._id, title: 'Opening hours', body: 'We are open Monday to Friday from 9 AM to 5 PM.', status: 'published' },
      { tenantId: tenant._id, title: 'Draft hours', body: 'Secret weekend hours are Sunday only.', status: 'draft' },
      { tenantId: otherTenant._id, title: 'Other hours', body: 'Other tenant opens every day.', status: 'published' },
    ]);
    const results = await retrieveKnowledge({ tenantId: tenant.id, question: 'What are your opening hours?' });
    expect(results).toEqual([{ title: 'Opening hours', body: 'We are open Monday to Friday from 9 AM to 5 PM.' }]);
    expect(JSON.stringify(results)).not.toContain('Secret');
    expect(JSON.stringify(results)).not.toContain('Other tenant');
  });

  it('rejects invalid questions and nonexistent tenants safely', async () => {
    await expect(retrieveKnowledge({ tenantId: 'invalid', question: 'hours' })).rejects.toMatchObject({ code: 'INVALID_ID' });
    await expect(retrieveKnowledge({ tenantId: tenant.id, question: '   ' })).rejects.toMatchObject({ code: 'INVALID_QUESTION' });
    await expect(retrieveKnowledge({ tenantId: tenant.id, question: 'a'.repeat(MAX_QUESTION_LENGTH + 1) })).rejects.toMatchObject({ code: 'QUESTION_TOO_LONG' });
    await expect(retrieveKnowledge({ tenantId: new mongoose.Types.ObjectId().toString(), question: 'hours' })).rejects.toMatchObject({ code: 'TENANT_NOT_FOUND' });
  });

  it('returns an empty set when no published tenant content matches', async () => {
    await BusinessContent.create({ tenantId: otherTenant._id, title: 'Private services', body: 'Private orthodontics information.', status: 'published' });
    await expect(retrieveKnowledge({ tenantId: tenant.id, question: 'orthodontics' })).resolves.toEqual([]);
  });

  it('limits document count and context size deterministically', async () => {
    await BusinessContent.create(Array.from({ length: 8 }, (_, index) => ({
      tenantId: tenant._id,
      title: `Service ${index} hours`,
      body: `Hours ${'information '.repeat(700)}`,
      status: 'published',
    })));
    const first = await retrieveKnowledge({ tenantId: tenant.id, question: 'hours information' });
    const second = await retrieveKnowledge({ tenantId: tenant.id, question: 'hours information' });
    expect(first).toEqual(second);
    expect(first.length).toBeLessThanOrEqual(MAX_DOCUMENTS);
    expect(first.reduce((total, item) => total + item.title.length + item.body.length, 0)).toBeLessThanOrEqual(MAX_CONTEXT_CHARACTERS);
  });

  it('truncates an oversized first document to respect the total context limit', async () => {
    // 8,000 characters is valid according to schema (<= 10000) but exceeds MAX_CONTEXT_CHARACTERS (6000)
    await BusinessContent.create({
      tenantId: tenant._id,
      title: 'Giant document title',
      body: 'Detailed policy facts '.repeat(350), // ~7,700 characters
      status: 'published',
    });
    const results = await retrieveKnowledge({ tenantId: tenant.id, question: 'Detailed policy facts' });
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Giant document title');
    expect(results[0].body.endsWith('…')).toBe(true);
    const totalChars = results[0].title.length + results[0].body.length;
    expect(totalChars).toBeLessThanOrEqual(MAX_CONTEXT_CHARACTERS);
  });

  it('breaks ties deterministically even when timestamps are missing or identical', async () => {
    // Create documents directly with undefined or identical timestamps
    const docA = await BusinessContent.create({
      tenantId: tenant._id,
      title: 'Guide Alpha',
      body: 'Identical guide details about pricing.',
      status: 'published',
    });
    const docB = await BusinessContent.create({
      tenantId: tenant._id,
      title: 'Guide Beta',
      body: 'Identical guide details about pricing.',
      status: 'published',
    });

    // Remove createdAt timestamp manually in DB to verify robust fallback
    await BusinessContent.collection.updateOne({ _id: docA._id }, { $unset: { createdAt: '' } });
    await BusinessContent.collection.updateOne({ _id: docB._id }, { $unset: { createdAt: '' } });

    const run1 = await retrieveKnowledge({ tenantId: tenant.id, question: 'pricing guide' });
    const run2 = await retrieveKnowledge({ tenantId: tenant.id, question: 'pricing guide' });
    expect(run1).toEqual(run2);
    expect(run1).toHaveLength(2);
  });
});
