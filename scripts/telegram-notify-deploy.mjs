/**
 * Appeler après wrangler deploy (local ou Workers Builds).
 * Définit TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID comme variables / secrets dans le tableau de bord Cloudflare Builds.
 */

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN?.trim();
const CHAT_ID = process.env.TELEGRAM_CHAT_ID?.trim();
const TEXT = 'CloudFlare a déployé le site.';

async function main() {
	if (!BOT_TOKEN || !CHAT_ID) {
		console.warn('[telegram-deploy] TELEGRAM_BOT_TOKEN ou TELEGRAM_CHAT_ID absent — notification ignorée.');
		return;
	}
	const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ chat_id: CHAT_ID, text: TEXT }),
	});
	if (!res.ok) {
		const body = await res.text();
		throw new Error(`Telegram sendMessage a échoué (${res.status}): ${body}`);
	}
}

main().catch((err) => {
	console.error('[telegram-deploy]', err);
	process.exitCode = 1;
});
