-- Impl-review follow-up (tarot-reading, F2): constrain tarot_readings.card_key
-- to the known Major Arcana keys, the same defense-in-depth the `orientation`
-- column already has via its check constraint. Values must stay in sync with
-- MAJOR_ARCANA's `key`s in src/lib/tarot/cards.ts.

alter table public.tarot_readings
  add constraint tarot_readings_card_key_check
  check (
    card_key in (
      'the-fool',
      'the-magician',
      'the-high-priestess',
      'the-empress',
      'the-emperor',
      'the-hierophant',
      'the-lovers',
      'the-chariot',
      'strength',
      'the-hermit',
      'wheel-of-fortune',
      'justice',
      'the-hanged-man',
      'death',
      'temperance',
      'the-devil',
      'the-tower',
      'the-star',
      'the-moon',
      'the-sun',
      'judgement',
      'the-world'
    )
  );
