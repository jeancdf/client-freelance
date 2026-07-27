import { createContext, useContext, type Dispatch } from 'react';
import type { Action, State } from './state';
import type { EtatEnregistrement } from './usePersistance';
import type { Entretien } from './useEntretien';

export interface CadrageContextValue {
  state: State;
  dispatch: Dispatch<Action>;
  /** Bascule clair/sombre : agit sur `<html>`, hors de l'état React. */
  onToggleTheme: () => void;
  /** Ce qu'affiche le témoin d'enregistrement dans l'en-tête. */
  enregistrement: EtatEnregistrement;
  /** Les échanges qui font attendre le client : validation d'un point, etc. */
  entretien: Entretien;
}

const CadrageContext = createContext<CadrageContextValue | null>(null);

export const CadrageProvider = CadrageContext.Provider;

export function useCadrage(): CadrageContextValue {
  const value = useContext(CadrageContext);
  if (!value) throw new Error('useCadrage doit être utilisé dans <Cadrage>');
  return value;
}

/** Le jeton de la session en cours, ou `null` en démonstration. */
export function useToken(): string | null {
  return useCadrage().state.session?.token ?? null;
}
