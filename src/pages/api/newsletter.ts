export const prerender = false;

import { env } from 'cloudflare:workers';
import type { APIRoute } from 'astro';
import { notifyNewsletterSignup } from '../../lib/telegram-notify';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/** Caractères typiquement utilisés pour du HTML/JS — refusés dans e-mail et nom. */
const TEXT_FORBIDDEN = /[\x00-\x1f<>"'`\\]/;
const NAME_MAX = 120;
/** Sources connues (formulaire) ; évite d’injecter du bruit arbitraire en base via ?source= */
const SOURCE_ALLOW = new Set(['site', 'accueil']);

function json(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json; charset=utf-8' },
	});
}

function normalizeName(raw: string): string {
	return raw.trim().replace(/\s+/g, ' ');
}

export const POST: APIRoute = async ({ request, locals }) => {
	const db = (env as unknown as { NEWSLETTER_DB?: D1Database }).NEWSLETTER_DB;

	if (!db) {
		return json({ error: 'Service indisponible — base de données non configurée.' }, 503);
	}

	let email: string;
	let name: string;
	try {
		const body = await request.json();
		email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
		name = typeof body?.name === 'string' ? normalizeName(body.name) : '';
	} catch {
		return json({ error: 'Corps de requête invalide.' }, 400);
	}

	if (!name || name.length > NAME_MAX) {
		return json({ error: 'Indiquez un nom (120 caractères max).' }, 400);
	}

	if (TEXT_FORBIDDEN.test(name)) {
		return json({ error: 'Nom invalide (caractères non autorisés).' }, 400);
	}

	if (!email || !EMAIL_RE.test(email)) {
		return json({ error: 'Adresse e-mail invalide.' }, 400);
	}

	if (TEXT_FORBIDDEN.test(email)) {
		return json({ error: 'Adresse e-mail invalide.' }, 400);
	}

	if (email.length > 254) {
		return json({ error: 'Adresse e-mail trop longue.' }, 400);
	}

	const rawSource = new URL(request.url).searchParams.get('source') ?? 'site';
	const source = SOURCE_ALLOW.has(rawSource) ? rawSource : 'site';

	try {
		const existing = await db.prepare('SELECT 1 AS x FROM subscribers WHERE email = ?').bind(email).first();
		const alreadySubscribed = existing != null;

		await db
			.prepare(
				`INSERT INTO subscribers (email, name, source) VALUES (?, ?, ?)
				 ON CONFLICT(email) DO UPDATE SET
				   name = IIF(LENGTH(TRIM(excluded.name)) > 0, TRIM(excluded.name), subscribers.name)`,
			)
			.bind(email, name, source)
			.run();

		if (!alreadySubscribed) {
			await notifyNewsletterSignup(name, email, locals.cfContext?.waitUntil);
		}

		return json({ ok: true, alreadySubscribed });
	} catch (err) {
		console.error('[newsletter] DB error:', err);
		return json({ error: 'Erreur serveur, réessayez dans quelques instants.' }, 500);
	}
};
