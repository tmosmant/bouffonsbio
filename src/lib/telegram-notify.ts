import { env } from 'cloudflare:workers';

async function telegramSend(botToken: string, chatId: string, text: string): Promise<void> {
	const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ chat_id: chatId, text }),
	});
	if (!res.ok) {
		const body = await res.text();
		console.error('[telegram] sendMessage erreur:', res.status, body);
	}
}

/**
 * Notifications newsletter (nouvelle inscription uniquement).
 * Tokens optionnels — sans eux, aucun envoi (pas d’erreur côté client).
 */
export async function notifyNewsletterSignup(
	name: string,
	email: string,
	waitUntil?: (promise: Promise<unknown>) => void,
): Promise<void> {
	const token = typeof env.TELEGRAM_BOT_TOKEN === 'string' ? env.TELEGRAM_BOT_TOKEN.trim() : '';
	const chatId = typeof env.TELEGRAM_CHAT_ID === 'string' ? env.TELEGRAM_CHAT_ID.trim() : '';
	if (!token || !chatId) {
		return;
	}
	const text = `${name} s'est inscrit à la newsletter. Son adresse email est : ${email}.`;

	const pending = telegramSend(token, chatId, text).catch((err) => console.error('[telegram] newsletter:', err));

	if (waitUntil) {
		waitUntil(pending);
	} else {
		await pending;
	}
}
