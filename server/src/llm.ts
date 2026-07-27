/**
 * Client OpenRouter.
 *
 * Deux partis pris, mesurés sur le cas réel :
 *  - le raisonnement est désactivé. Sur ces générations courtes et très
 *    contraintes, il coûtait 2 945 tokens pour trois phrases — dix-neuf fois
 *    le prix, sans gain de qualité.
 *  - la sortie passe par un schéma JSON strict. Le serveur ne parse jamais de
 *    prose : ce qui n'entre pas dans le schéma est un échec, pas une surprise.
 *
 * Sans clé configurée, `estActif()` est faux et l'application retombe sur les
 * contenus écrits de la maquette. Elle marche, en moins fin.
 */

const URL_API = 'https://openrouter.ai/api/v1/chat/completions';

export const MODELE = process.env.CADRAGE_MODELE ?? 'qwen/qwen3.7-plus';

const CLE = process.env.CADRAGE_OPENROUTER_KEY ?? '';

/** Au-delà, le client attend devant un écran vide : mieux vaut le repli. */
const DELAI_MS = Number(process.env.CADRAGE_LLM_TIMEOUT ?? 25_000);

export function estActif(): boolean {
  return CLE.length > 0;
}

export interface Message {
  role: 'system' | 'user';
  content: string | Array<Record<string, unknown>>;
}

export class ErreurLlm extends Error {}

interface ReponseApi {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
  usage?: { total_tokens?: number; cost?: number };
}

/** Ce qu'une génération a coûté, pour le journal. */
export interface Cout {
  tokens: number;
  dollars: number;
}

export interface Resultat<T> {
  valeur: T;
  cout: Cout;
}

/**
 * Un appel, une réponse typée. `schema` est un JSON Schema : le modèle est
 * contraint de s'y tenir côté fournisseur, on ne fait donc que le relire.
 */
export async function generer<T>(
  messages: Message[],
  nomSchema: string,
  schema: Record<string, unknown>,
  options: { temperature?: number; maxTokens?: number } = {},
): Promise<Resultat<T>> {
  if (!estActif()) throw new ErreurLlm('Aucune clé OpenRouter configurée.');

  const corps = {
    model: MODELE,
    messages,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.maxTokens ?? 1200,
    reasoning: { enabled: false },
    response_format: {
      type: 'json_schema',
      json_schema: { name: nomSchema, strict: true, schema },
    },
  };

  const arret = AbortSignal.timeout(DELAI_MS);
  let reponse: Response;
  try {
    reponse = await fetch(URL_API, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${CLE}`,
        'content-type': 'application/json',
        // Identifie l'application dans les statistiques OpenRouter. ASCII
        // seulement : un en-tête HTTP ne transporte pas d'UTF-8.
        'x-title': 'Cadrage - Studio Cazals',
      },
      body: JSON.stringify(corps),
      signal: arret,
    });
  } catch (cause) {
    throw new ErreurLlm(`Appel au modèle impossible : ${(cause as Error).message}`);
  }

  const donnees = (await reponse.json()) as ReponseApi;

  if (!reponse.ok || donnees.error) {
    throw new ErreurLlm(donnees.error?.message ?? `Le modèle a répondu ${reponse.status}.`);
  }

  const contenu = donnees.choices?.[0]?.message?.content;
  if (!contenu) throw new ErreurLlm('Réponse vide du modèle.');

  let valeur: T;
  try {
    valeur = JSON.parse(contenu) as T;
  } catch {
    throw new ErreurLlm('Le modèle a répondu autre chose que du JSON.');
  }

  return {
    valeur,
    cout: { tokens: donnees.usage?.total_tokens ?? 0, dollars: donnees.usage?.cost ?? 0 },
  };
}

/** Raccourci de schéma : un objet dont toutes les propriétés sont requises. */
export function objet(proprietes: Record<string, unknown>): Record<string, unknown> {
  return {
    type: 'object',
    properties: proprietes,
    required: Object.keys(proprietes),
    additionalProperties: false,
  };
}

export const texte = { type: 'string' } as const;

export function liste(items: unknown, min: number, max: number): Record<string, unknown> {
  return { type: 'array', items, minItems: min, maxItems: max };
}
