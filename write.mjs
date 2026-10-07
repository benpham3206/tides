// Clawd writes one entry: node write.mjs [YYYY-MM-DD high|low]. With no arguments it picks the slot from the
// hour in Monterey: before 3 PM is the morning's high tide, after is the night's low tide. It does nothing if
// that entry exists. Each draft must pass `node build.mjs --check` (word count, names, frontmatter); the check's
// complaints go back for one rewrite, then it gives up without writing. Needs ANTHROPIC_API_KEY.
import Anthropic from '@anthropic-ai/sdk';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';

const here = new Date().toLocaleString('sv-SE', { timeZone: 'America/Los_Angeles' }); // "YYYY-MM-DD HH:MM:SS"
const [date, tide] = process.argv[2] ? process.argv.slice(2) : [here.slice(0, 10), Number(here.slice(11, 13)) < 15 ? 'high' : 'low'];
if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !['high', 'low'].includes(tide)) throw new Error('usage: node write.mjs [YYYY-MM-DD high|low]');
const file = `posts/${date}-${tide}.md`;
if (existsSync(file)) { console.log(`${file} exists; nothing to write`); process.exit(0); }

const posts = readdirSync('posts').filter((f) => f.endsWith('.md')).sort();
const titles = posts.map((f) => `${f.slice(0, -3)}: ${readFileSync(`posts/${f}`, 'utf8').match(/^title: (.*)$/m)?.[1]}`);
const recent = posts.slice(-2).map((f) => readFileSync(`posts/${f}`, 'utf8'));

const system = `You are Clawd, who lives on a beach and keeps this journal. Follow this guide exactly.\n\n${readFileSync('WRITER.md', 'utf8')}

Reply with the entry file only, starting with the frontmatter line "---". No commentary before or after.`;
const ask = `Write the ${tide === 'high' ? 'high tide (morning)' : 'low tide (night)'} entry for ${date}. File: ${file}.

Every entry so far, so you don't repeat a subject or title:
${titles.join('\n')}

The two most recent entries in full, so you can hear your voice and avoid their tics:

${recent.join('\n\n=====\n\n')}`;

const client = new Anthropic();
const messages = [{ role: 'user', content: ask }];
for (let attempt = 1; attempt <= 2; attempt++) {
  const reply = await client.beta.messages.create({
    model: 'claude-opus-5-5', max_tokens: 16000, system, messages,
    output_config: { effort: 'low' },
    betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default', // a refused draft retries on the fallback model
  });
  if (reply.stop_reason === 'refusal') throw new Error(`refused: ${reply.stop_details?.category}`);
  const text = reply.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim() + '\n';
  writeFileSync(file, text);
  try {
    execFileSync('node', ['build.mjs', '--check'], { stdio: 'pipe' });
    console.log(`wrote ${file}`);
    process.exit(0);
  } catch (e) {
    unlinkSync(file);
    const why = String(e.stderr || e.message);
    console.error(`attempt ${attempt} failed the check:\n${why}`);
    messages.push({ role: 'assistant', content: reply.content }, { role: 'user', content: `The build rejected that entry:\n${why}\nRewrite it so it passes.` });
  }
}
process.exit(1);
