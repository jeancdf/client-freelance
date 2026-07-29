import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { estInscription } from '../src/lib/lien.ts';

describe('la route du formulaire public', () => {
  it('reconnaît uniquement /commencer avec ou sans barre finale', () => {
    assert.equal(estInscription('https://studiocazals.fr/commencer'), true);
    assert.equal(estInscription('https://studiocazals.fr/commencer/'), true);
    assert.equal(estInscription('https://studiocazals.fr/'), false);
    assert.equal(estInscription('https://studiocazals.fr/commencer-autre'), false);
  });
});
