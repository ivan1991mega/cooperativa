/**
 * Logica di conflitto tra le location del gruppo "Avinal".
 *
 * Il complesso Avinal è composto da spazi che si sovrappongono fisicamente:
 *   - "Avinal Tutto" occupa l'intero complesso → confligge con Casa, Basso, Alto.
 *   - "Avinal Casa", "Avinal Basso", "Avinal Alto" sono porzioni distinte tra loro,
 *     ma ognuna è inclusa in "Avinal Tutto".
 *
 * Le altre location (Ospitale di Cadore, Col Pigner) sono indipendenti:
 * confliggono solo con se stesse.
 *
 * Questa mappa indica, per ogni location, con quali ALTRE location una
 * prenotazione va considerata "sovrapposta" (oltre a se stessa).
 */
export const CONFLITTI = {
  'Avinal Tutto': [
    'Avinal Campo 1 - Bagni in muratura',
    'Avinal Campo 2 - entrata',
    'Avinal Campo 3 - prato non attrezzato',
    'Avinal Casa',
  ],
  'Avinal Campo 1 - Bagni in muratura': ['Avinal Tutto'],
  'Avinal Campo 2 - entrata': ['Avinal Tutto'],
  'Avinal Campo 3 - prato non attrezzato': ['Avinal Tutto'],
  'Avinal Casa': ['Avinal Tutto'],
  'Ospitale di Cadore': [],
  'Col Pigner': [],
};

/**
 * Dato il nome di una location, restituisce l'elenco di TUTTI i nomi
 * (incluso se stesso) che vanno controllati per la sovrapposizione date.
 */
export function nomiInConflitto(nomeLocation) {
  const altri = CONFLITTI[nomeLocation] || [];
  return [nomeLocation, ...altri];
}

/**
 * Due intervalli di date [a1,a2] e [b1,b2] si sovrappongono se
 * a1 <= b2 && b1 <= a2 (confronto su stringhe YYYY-MM-DD funziona lessicograficamente).
 */
export function dateSiSovrappongono(arrivoA, partenzaA, arrivoB, partenzaB) {
  return arrivoA <= partenzaB && arrivoB <= partenzaA;
}
