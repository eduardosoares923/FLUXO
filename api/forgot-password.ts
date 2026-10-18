const NEUTRAL_SUCCESS_MESSAGE =
  'Se existir uma conta com esses dados, enviamos um link para o e-mail cadastrado. Olhe também o spam.';

const IP_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const IP_RATE_LIMIT_MAX = 5;

const EMAIL_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const EMAIL_RATE_LIMIT_MAX = 3;

function normalizeKey(str: unknown): string {
  if (!str) return '';
  return String(str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function getClientIp(req: any): string {
  const xff = req.headers?.['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim()) {
    return xff.split(',')[0].trim();
  }
  if (Array.isArray(xff) && xff.length > 0) {
    return String(xff[0]).trim();
  }
  return req.socket?.remoteAddress || 'unknown';
}

function escapeHtml(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function checkRateLimit(
  db: any,
  key: string,
  windowMs: number,
  maxRequests: number
): Promise<boolean> {
  const safeKey = key.replace(/[^a-zA-Z0-9_.:@-]/g, '_').slice(0, 120);
  const ref = db.collection('_rate_limits').doc(safeKey);
  const now = Date.now();

  try {
    const allowed = await db.runTransaction(async (t: any) => {
      const snap = await t.get(ref);
      const data = snap.exists ? snap.data() : null;
      const resetAt = typeof data?.resetAt === 'number' ? data.resetAt : 0;
      const count = typeof data?.count === 'number' ? data.count : 0;

      if (now > resetAt) {
        t.set(ref, { count: 1, resetAt: now + windowMs, updatedAt: now });
        return true;
      }

      if (count >= maxRequests) {
        return false;
      }

      t.update(ref, { count: count + 1, updatedAt: now });
      return true;
    });
    return allowed;
  } catch (e) {
    console.warn('Falha ao checar rate limit em forgot-password:', e);
    return true;
  }
}

export default async function handler(req: any, res: any) {
  let getApps: any;
  let initializeApp: any;
  let cert: any;
  let getAuth: any;
  let getFirestore: any;
  let nodemailer: any;

  try {
    ({ getApps, initializeApp, cert } = await import('firebase-admin/app'));
    ({ getAuth } = await import('firebase-admin/auth'));
    ({ getFirestore } = await import('firebase-admin/firestore'));
    const nm = await import('nodemailer');
    nodemailer = nm.default || nm;
  } catch (loadErr: any) {
    console.error('Erro ao carregar dependencias em api/forgot-password:', loadErr);
    return res.status(500).json({
      error:
        'Erro ao carregar o servidor: ' +
        (loadErr && loadErr.message ? loadErr.message : String(loadErr)),
    });
  }

  function initAdmin(): string | null {
    if (getApps().length > 0) return null;
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) {
      return 'Variavel FIREBASE_SERVICE_ACCOUNT nao configurada na Vercel.';
    }
    try {
      const credentials = JSON.parse(raw);
      initializeApp({ credential: cert(credentials) });
      return null;
    } catch (e: any) {
      return 'FIREBASE_SERVICE_ACCOUNT nao e um JSON valido: ' + (e?.message || String(e));
    }
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método não permitido. Use POST.' });
  }

  const initError = initAdmin();
  if (initError) {
    console.error('Erro de configuracao em api/forgot-password:', initError);
    return res.status(500).json({ error: initError });
  }

  const db = getFirestore();
  const auth = getAuth();

  const clientIp = getClientIp(req);
  const ipAllowed = await checkRateLimit(
    db,
    `forgot_ip_${clientIp}`,
    IP_RATE_LIMIT_WINDOW_MS,
    IP_RATE_LIMIT_MAX
  );

  if (!ipAllowed) {
    return res.status(429).json({
      ok: false,
      message: 'Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.',
      error: 'Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.',
    });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const rawIdentifier = typeof body.identifier === 'string' ? body.identifier.trim() : '';

    if (!rawIdentifier) {
      return res.status(200).json({ ok: true, message: NEUTRAL_SUCCESS_MESSAGE });
    }

    // Não aceita CPF (apenas números / formato de CPF)
    const digitsOnly = rawIdentifier.replace(/\D/g, '');
    if (!rawIdentifier.includes('@') && digitsOnly.length === 11 && /^[\d.\-\s]+$/.test(rawIdentifier)) {
      return res.status(200).json({ ok: true, message: NEUTRAL_SUCCESS_MESSAGE });
    }

    let targetEmail = '';
    let userName = '';
    let userStatus = 'ativo';
    let foundUserDoc: any = null;

    if (rawIdentifier.includes('@')) {
      targetEmail = rawIdentifier.toLowerCase();
    } else {
      const usernameKey = normalizeKey(rawIdentifier).replace(/\s+/g, '');
      if (usernameKey) {
        const lookupSnap = await db.collection('user_lookup').doc(usernameKey).get();
        if (lookupSnap.exists && lookupSnap.data()?.email) {
          targetEmail = String(lookupSnap.data().email).trim().toLowerCase();
        } else {
          const byUsernameSnap = await db
            .collection('users')
            .where('username', '==', usernameKey)
            .limit(1)
            .get();
          if (!byUsernameSnap.empty) {
            foundUserDoc = byUsernameSnap.docs[0].data();
            targetEmail = String(foundUserDoc?.email || '').trim().toLowerCase();
          }
        }
      }
    }

    if (!targetEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail)) {
      return res.status(200).json({ ok: true, message: NEUTRAL_SUCCESS_MESSAGE });
    }

    const emailAllowed = await checkRateLimit(
      db,
      `forgot_email_${normalizeKey(targetEmail)}`,
      EMAIL_RATE_LIMIT_WINDOW_MS,
      EMAIL_RATE_LIMIT_MAX
    );

    if (!emailAllowed) {
      return res.status(429).json({
        ok: false,
        message: 'Muitas solicitações para esta conta. Aguarde um pouco antes de tentar novamente.',
        error: 'Muitas solicitações para esta conta. Aguarde um pouco antes de tentar novamente.',
      });
    }

    if (!foundUserDoc) {
      const userSnap = await db
        .collection('users')
        .where('email', '==', targetEmail)
        .limit(1)
        .get();
      if (!userSnap.empty) {
        foundUserDoc = userSnap.docs[0].data();
      }
    }

    if (foundUserDoc) {
      userStatus = String(foundUserDoc.status || 'ativo').toLowerCase();
      userName = String(foundUserDoc.name || foundUserDoc.person || '').trim();
    }

    // Não envia para contas pendentes ou inativas
    if (userStatus === 'pendente' || userStatus === 'inativo') {
      return res.status(200).json({ ok: true, message: NEUTRAL_SUCCESS_MESSAGE });
    }

    // Verifica se o usuário existe no Firebase Auth e obtém o nome caso não tenha vindo do Firestore
    let authUser: any = null;
    try {
      authUser = await auth.getUserByEmail(targetEmail);
      if (!userName && authUser?.displayName) {
        userName = String(authUser.displayName).trim();
      }
    } catch {
      authUser = null;
    }

    if (!authUser) {
      return res.status(200).json({ ok: true, message: NEUTRAL_SUCCESS_MESSAGE });
    }

    const siteUrl = String(process.env.SITE_URL || 'https://w1nd.vercel.app').replace(/\/+$/, '');
    const resetLink = await auth.generatePasswordResetLink(targetEmail, {
      url: `${siteUrl}/login`,
    });

    const gmailUser = process.env.GMAIL_USER || 'suportewynd@gmail.com';
    const gmailPass = process.env.GMAIL_APP_PASSWORD;

    if (!gmailPass) {
      console.error('Variável GMAIL_APP_PASSWORD não configurada na Vercel.');
      return res.status(200).json({ ok: true, message: NEUTRAL_SUCCESS_MESSAGE });
    }

    const firstName = (userName || targetEmail.split('@')[0] || 'você').split(/\s+/)[0];
    const safeName = escapeHtml(firstName);
    const safeLink = escapeHtml(resetLink);

    const textBody = [
      'Redefinir sua senha',
      '',
      `Oi, ${firstName}. Use o link abaixo para criar uma nova senha. O link vale por 1 hora. Se não foi você, ignore este e-mail, sua senha continua a mesma.`,
      '',
      resetLink,
      '',
      'Equipe Wynd, suportewynd@gmail.com',
    ].join('\n');

    const htmlBody = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Redefinir sua senha do Wynd</title>
</head>
<body style="margin:0;padding:32px 16px;background-color:#F3F1E9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#121A16;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:480px;background-color:#FFFFFF;border:1px solid #E6E2D6;border-radius:24px;padding:32px;">
          <tr>
            <td>
              <div style="font-size:20px;font-weight:700;color:#2F7A57;margin-bottom:20px;">W wynd</div>
              <h1 style="margin:0 0 14px 0;font-size:24px;line-height:1.25;font-weight:700;color:#121A16;">Redefinir sua senha</h1>
              <p style="margin:0 0 24px 0;font-size:15px;line-height:1.6;color:#121A16;">
                Oi, ${safeName}. Use o botão para criar uma nova senha. O link vale por 1 hora. Se não foi você, ignore este e-mail, sua senha continua a mesma.
              </p>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px 0;">
                <tr>
                  <td align="center" bgcolor="#2F7A57" style="border-radius:14px;">
                    <a href="${safeLink}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:700;color:#FFFFFF;text-decoration:none;border-radius:14px;background-color:#2F7A57;">
                      Criar nova senha
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 6px 0;font-size:12px;line-height:1.5;color:#667069;">
                Se o botão não abrir, copie e cole este link no navegador:
              </p>
              <p style="margin:0 0 24px 0;font-size:12px;line-height:1.5;word-break:break-all;color:#2F7A57;">
                <a href="${safeLink}" target="_blank" rel="noopener noreferrer" style="color:#2F7A57;text-decoration:underline;">${safeLink}</a>
              </p>
              <hr style="border:none;border-top:1px solid #E6E2D6;margin:0 0 16px 0;" />
              <p style="margin:0;font-size:12px;line-height:1.5;color:#667069;">
                Equipe Wynd, suportewynd@gmail.com
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: gmailUser,
        pass: gmailPass,
      },
    });

    await transporter.sendMail({
      from: '"Wynd" <suportewynd@gmail.com>',
      to: targetEmail,
      replyTo: 'suportewynd@gmail.com',
      subject: 'Redefinir sua senha do Wynd',
      text: textBody,
      html: htmlBody,
    });

    return res.status(200).json({
      ok: true,
      message: NEUTRAL_SUCCESS_MESSAGE,
    });
  } catch (err: any) {
    console.error('Erro em api/forgot-password:', err);
    return res.status(200).json({
      ok: true,
      message: NEUTRAL_SUCCESS_MESSAGE,
    });
  }
}
