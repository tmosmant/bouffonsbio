/**
 * Rapport hebdomadaire Umami → Telegram (vendredi 18:00 UTC, ~20 h Paris été).
 *
 * Secrets : wrangler secret put TELEGRAM_BOT_TOKEN -c …
 * Idem UMAMI_API_KEY, TELEGRAM_CHAT_ID
 * Vars : UMAMI_WEBSITE_ID, UMAMI_API_BASE ( défaut https://api.umami.is/v1 ; voir région Umami Cloud )
 */

interface Env {
	TELEGRAM_BOT_TOKEN: string;
	TELEGRAM_CHAT_ID: string;
	UMAMI_API_KEY: string;
	UMAMI_WEBSITE_ID: string;
	UMAMI_API_BASE?: string;
}

type UmamiStats = {
	pageviews?: number;
	visitors?: number;
	visits?: number;
	bounces?: number;
	totaltime?: number;
	comparison?: unknown;
};

type UmamiMetricRow = { x?: string; y?: number };

const DAY_MS = 24 * 60 * 60 * 1000;

function apiBase(env: Env): string {
	const raw = (env.UMAMI_API_BASE ?? 'https://api.umami.is/v1').replace(/\/+$/, '');
	return raw;
}

function formatDate(ms: number, locale = 'fr-FR'): string {
	return new Date(ms).toLocaleDateString(locale, {
		weekday: 'short',
		day: 'numeric',
		month: 'short',
		year: 'numeric',
	});
}

function pctChange(current: number, previous: number): string {
	if (previous === 0) {
		return current === 0 ? '—' : 'nouveau ✨';
	}
	const p = (((current - previous) / previous) * 100).toFixed(0);
	const sign = current >= previous ? '+' : '';
	return `${sign}${p} %`;
}

function bouncePct(bounces: number, visits: number): string {
	if (visits <= 0) return '—';
	return `${((100 * bounces) / visits).toFixed(0)} %`;
}

async function telegramSend(botToken: string, chatId: string, text: string): Promise<void> {
	const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
	});
	if (!res.ok) {
		throw new Error(`Telegram: ${res.status} ${await res.text()}`);
	}
}

async function umamiStats(env: Env, startAt: number, endAt: number): Promise<UmamiStats> {
	const sep = '?';
	const q = `${sep}startAt=${startAt}&endAt=${endAt}`;
	const base = `${apiBase(env)}/websites/${env.UMAMI_WEBSITE_ID}/stats`;
	const res = await fetch(base + q, {
		headers: {
			Accept: 'application/json',
			'x-umami-api-key': env.UMAMI_API_KEY,
		},
	});
	if (!res.ok) {
		throw new Error(`Umami stats ${res.status}: ${await res.text()}`);
	}
	return (await res.json()) as UmamiStats;
}

async function umamiTopPaths(env: Env, startAt: number, endAt: number, limit = 5): Promise<UmamiMetricRow[]> {
	const q = `?startAt=${startAt}&endAt=${endAt}&type=path&limit=${limit}&offset=0`;
	const url = `${apiBase(env)}/websites/${env.UMAMI_WEBSITE_ID}/metrics${q}`;
	const res = await fetch(url, {
		headers: {
			Accept: 'application/json',
			'x-umami-api-key': env.UMAMI_API_KEY,
		},
	});
	if (!res.ok) {
		throw new Error(`Umami metrics ${res.status}: ${await res.text()}`);
	}
	const rows = (await res.json()) as UmamiMetricRow[];
	if (!Array.isArray(rows)) return [];
	return [...rows].sort((a, b) => (b.y ?? 0) - (a.y ?? 0)).slice(0, limit);
}

async function deliverWeeklyDigest(env: Env): Promise<void> {
	const token = env.TELEGRAM_BOT_TOKEN?.trim();
	const chatId = env.TELEGRAM_CHAT_ID?.trim();
	const apiKey = env.UMAMI_API_KEY?.trim();
	const siteId = env.UMAMI_WEBSITE_ID?.trim();
	if (!token || !chatId || !apiKey || !siteId) {
		throw new Error('[weekly-stats] Secrets / UMAMI_WEBSITE_ID incomplets.');
	}

	const endAt = Date.now();
	const startAt = endAt - 7 * DAY_MS;
	const prevEnd = startAt;
	const prevStart = prevEnd - 7 * DAY_MS;

	const [cur, prev, top] = await Promise.all([
		umamiStats(env, startAt, endAt),
		umamiStats(env, prevStart, prevEnd),
		umamiTopPaths(env, startAt, endAt, 5),
	]);

	const pv = cur.pageviews ?? 0;
	const vis = cur.visitors ?? 0;
	const vsti = cur.visits ?? 0;
	const bn = cur.bounces ?? 0;
	const bounce = bouncePct(bn, vsti);

	const lines: string[] = [
		'📊 bouffonsbios.org — rapport Umami (7 derniers jours)',
		`📅 Du ${formatDate(startAt)} au ${formatDate(endAt)}`,
		'',
		`• Pages vues : ${pv.toLocaleString('fr-FR')} (${pctChange(pv, prev.pageviews ?? 0)} vs semaine précédente)`,
		`• Visiteurs uniques : ${vis.toLocaleString('fr-FR')} (${pctChange(vis, prev.visitors ?? 0)})`,
		`• Visites : ${vsti.toLocaleString('fr-FR')} (${pctChange(vsti, prev.visits ?? 0)})`,
		`• Taux de rebond (approximatif) : ${bounce}`,
	];

	if ((cur.totaltime ?? 0) > 0 && vsti > 0) {
		const mins = Math.round((cur.totaltime ?? 0) / vsti / 60);
		lines.push(`• Temps cumulé / visite (ordre de grandeur Umami) : ~${mins} min`);
	}

	if (top.length > 0) {
		lines.push('', '🏆 Pages les plus consultées :');
		top.forEach((row, i) => {
			const path = typeof row.x === 'string' && row.x !== '' ? row.x : '(inconnu)';
			const hits = typeof row.y === 'number' ? row.y.toLocaleString('fr-FR') : '?';
			lines.push(`${i + 1}. ${path} — ${hits} vues`);
		});
	}

	lines.push('', '— Envoyé depuis le worker « bouffonsbios-weekly-stats ».');
	const text = lines.join('\n');
	await telegramSend(token, chatId, text);
}

export default {
	async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
		ctx.waitUntil(
			deliverWeeklyDigest(env).catch(async (err) => {
				console.error('[weekly-stats]', err);
				const token = env.TELEGRAM_BOT_TOKEN?.trim();
				const chatId = env.TELEGRAM_CHAT_ID?.trim();
				if (!token || !chatId) return;
				await telegramSend(token, chatId, `⚠️ Rapport Umami impossible : ${err instanceof Error ? err.message : String(err)}`);
			}),
		);
	},
};
