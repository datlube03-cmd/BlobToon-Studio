import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { loadPromptFile } from './generator';

export const TopicIdeaSchema = z.object({
  rank: z.number().int().positive(),
  topic: z.string().min(8),
  hookScore: z.number().min(1).max(100),
  painPoint: z.string().min(2),
  gameRule: z.string().min(2),
  reason: z.string().min(8),
});
export type TopicIdea = z.infer<typeof TopicIdeaSchema>;

export const TopicIdeaListSchema = z.array(TopicIdeaSchema).min(1);

const IDEA_TEMPLATES = [
  {
    painPoint: 'Screen-time limits',
    gameRule: 'Parents take over your main account when you ignore chores',
    topicTpl: 'What if your Mom logged into your main {{NICHE}} account every time you skipped a chore?',
    reason: 'Instant status panic: losing rare inventory items to a clueless parent hooks gamers in 2 seconds.',
    baseScore: 98,
  },
  {
    painPoint: 'Unfinished homework',
    gameRule: 'Your bedroom physically shrinks by 10% per missing assignment',
    topicTpl: 'What if every skipped {{NICHE}} assignment shrank your bedroom by 10%?',
    reason: 'Visually escalating claustrophobia makes viewers watch until Day 3 to see how tiny the room gets.',
    baseScore: 95,
  },
  {
    painPoint: 'Annoying little sibling',
    gameRule: 'Sibling gets a real-life pause & rewind remote control',
    topicTpl: 'What if your little sibling found a remote that paused you during {{NICHE}}?',
    reason: 'Universal sibling rivalry combined with a simple superpower triggers immediate comment debates.',
    baseScore: 93,
  },
  {
    painPoint: 'Staying up past bedtime',
    gameRule: 'Every minute past midnight drains 100 in-game coins',
    topicTpl: 'What if every minute past bedtime drained 100 coins from your {{NICHE}} wallet?',
    reason: 'Pits sleep deprivation directly against hard-earned virtual currency with a ticking clock.',
    baseScore: 91,
  },
  {
    painPoint: 'Dreaded dentist / checkup',
    gameRule: 'Your health bar floats above your head like a boss fight',
    topicTpl: 'What if {{NICHE}} graded your daily habits with a giant floating boss health bar?',
    reason: 'Turns mundane daily nagging into an instant high-stakes arcade boss encounter.',
    baseScore: 89,
  },
  {
    painPoint: 'Best friend goes offline',
    gameRule: 'An NPC clone replaces you whenever you stall for 5 minutes',
    topicTpl: 'What if an auto-pilot NPC replaced you in {{NICHE}} whenever you went AFK for five minutes?',
    reason: 'The twist where friends prefer the NPC version of you delivers peak dark comedy.',
    baseScore: 87,
  },
  {
    painPoint: 'Group project slackers',
    gameRule: 'Your movement speed drops by 20% for every lie you tell',
    topicTpl: 'What if every excuse you made in {{NICHE}} slowed your real-life walking speed by 20%?',
    reason: 'Funny physical slapstick as characters freeze in slow-motion by Day 2.',
    baseScore: 85,
  },
  {
    painPoint: 'Phone battery anxiety',
    gameRule: 'Your social battery percentage is projected above your head',
    topicTpl: 'What if your {{NICHE}} energy bar was visible to everyone in the room?',
    reason: 'Relatable teen/student anxiety visualized with a clear 100%-to-0% countdown meter.',
    baseScore: 83,
  },
  {
    painPoint: 'Cafeteria / dinner rules',
    gameRule: 'Trading lunch items works like a high-stakes loot auction',
    topicTpl: 'What if {{NICHE}} ran on a live loot-drop auction timer every single day?',
    reason: 'Fast-paced bidding chaos creates natural Day 1 fun and Day 3 bankruptcy.',
    baseScore: 81,
  },
  {
    painPoint: 'Pop quizzes & tests',
    gameRule: 'You can spend your allowance to buy a 10-second time rewind',
    topicTpl: 'What if you could rewind any {{NICHE}} mistake by 10 seconds, but it cost $5 each time?',
    reason: 'Exploitable loophole that spirals into hilarious debt by the final loop.',
    baseScore: 79,
  },
];

export function buildDeterministicIdeas(niche: string, count = 10): TopicIdea[] {
  const cleanNiche = niche.trim() || 'gaming & school';
  const safeCount = Math.max(1, Math.min(25, count));
  const ideas: TopicIdea[] = [];

  for (let i = 0; i < safeCount; i++) {
    const tpl = IDEA_TEMPLATES[i % IDEA_TEMPLATES.length];
    const cycleSuffix = i >= IDEA_TEMPLATES.length ? ` (Part ${Math.floor(i / IDEA_TEMPLATES.length) + 1})` : '';
    ideas.push({
      rank: i + 1,
      topic: tpl.topicTpl.replaceAll('{{NICHE}}', cleanNiche) + cycleSuffix,
      hookScore: Math.max(60, tpl.baseScore - i * 2),
      painPoint: tpl.painPoint,
      gameRule: tpl.gameRule,
      reason: tpl.reason,
    });
  }
  return ideas;
}

export async function generateTopicIdeas(
  niche: string,
  count = 10,
  options: { apiKey?: string; model?: string } = {}
): Promise<{ ideas: TopicIdea[]; source: 'anthropic' | 'deterministic' }> {
  const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY ?? '';
  const model = options.model ?? process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5-5';
  const hasRealKey =
    Boolean(apiKey) &&
    apiKey !== 'your_anthropic_api_key_here' &&
    apiKey !== 'MY_ANTHROPIC_API_KEY' &&
    !apiKey.startsWith('placeholder');

  if (!hasRealKey) {
    return {
      ideas: buildDeterministicIdeas(niche, count),
      source: 'deterministic',
    };
  }

  try {
    const promptTemplate = loadPromptFile(
      'prompts/ideas.md',
      'Generate {{COUNT}} ranked "What If" topic ideas for niche "{{NICHE}}" as JSON array.'
    );
    const prompt = promptTemplate
      .replaceAll('{{NICHE}}', niche)
      .replaceAll('{{COUNT}}', String(count));

    const client = new Anthropic({ apiKey });
    const res = await client.messages.create({
      model,
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    });
    const textBlock = res.content.find((b) => b.type === 'text');
    const raw = textBlock && 'text' in textBlock ? textBlock.text : '[]';
    const firstBracket = raw.indexOf('[');
    const lastBracket = raw.lastIndexOf(']');
    const jsonSlice =
      firstBracket !== -1 && lastBracket > firstBracket
        ? raw.slice(firstBracket, lastBracket + 1)
        : raw;
    const parsed = TopicIdeaListSchema.parse(JSON.parse(jsonSlice));
    return {
      ideas: parsed
        .sort((a, b) => b.hookScore - a.hookScore)
        .slice(0, count)
        .map((item, idx) => ({ ...item, rank: idx + 1 })),
      source: 'anthropic',
    };
  } catch (err) {
    console.warn(
      `[BlobToon Ideas] Anthropic API call failed (${err instanceof Error ? err.message : String(err)}). Using deterministic ranked ideas.`
    );
    return {
      ideas: buildDeterministicIdeas(niche, count),
      source: 'deterministic',
    };
  }
}
