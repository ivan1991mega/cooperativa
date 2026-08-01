import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'cambia-questo-segreto-in-produzione';

export function generaToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, ruolo: user.ruolo, nome: user.nome },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

export function verificaToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

/**
 * Middleware: richiede un utente autenticato.
 * Legge il token dal cookie 'token' o dall'header Authorization.
 */
export function richiediAuth(req, res, next) {
  const token =
    req.cookies?.token ||
    (req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.slice(7)
      : null);

  if (!token) {
    return res.status(401).json({ errore: 'Non autenticato' });
  }

  const payload = verificaToken(token);
  if (!payload) {
    return res.status(401).json({ errore: 'Token non valido o scaduto' });
  }

  req.user = payload;
  next();
}

/**
 * Middleware: richiede ruolo admin.
 */
export function richiediAdmin(req, res, next) {
  if (req.user?.ruolo !== 'admin') {
    return res.status(403).json({ errore: 'Accesso riservato all\'amministrazione' });
  }
  next();
}
