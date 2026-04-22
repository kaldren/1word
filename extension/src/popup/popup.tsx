import { memo, useEffect, useMemo, useState, useCallback } from 'react';
import logoUrl from '../../48.png';
import { createRoot } from 'react-dom/client';
import type { SavedWord, Tier, UsageStatus, WordSense } from '@vocab/shared';
import type { Msg, MsgResult } from '../lib/messages';
import { STORAGE_KEYS } from '../lib/messages';

const MAX_VISIBLE_ROWS = 200;

if (
  typeof document !== 'undefined' &&
  !document.getElementById('vocab-popup-style')
) {
  const style = document.createElement('style');
  style.id = 'vocab-popup-style';
  style.textContent = `
    .vocab-remove-btn {
      appearance: none;
      border: none;
      background: transparent;
      color: #9ca3af;
      cursor: pointer;
      font-size: 16px;
      line-height: 1;
      padding: 2px 6px;
      border-radius: 4px;
      flex-shrink: 0;
    }
    .vocab-remove-btn:hover:not(:disabled) { background: #ef4444; color: #fff; }
    .vocab-remove-btn:disabled { cursor: default; }
    .vocab-expand-btn {
      appearance: none;
      border: none;
      background: transparent;
      color: #9ca3af;
      cursor: pointer;
      font-size: 13px;
      line-height: 1;
      padding: 2px 4px;
      border-radius: 4px;
      flex-shrink: 0;
    }
    .vocab-expand-btn:hover:not(:disabled) { background: #f3f4f6; color: #374151; }
    .vocab-expand-btn:disabled { cursor: default; }
  `;
  document.head.appendChild(style);
}

async function send<T extends MsgResult>(msg: Msg): Promise<T> {
  return (await chrome.runtime.sendMessage(msg)) as T;
}

interface ProfileState {
  signedIn: boolean;
  email?: string;
  tier?: Tier;
  usage?: UsageStatus;
}

function nextResetLabel(): string {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() + 1, 1);
  d.setUTCHours(0, 0, 0, 0);
  const month = d.toLocaleString(undefined, { month: 'long', timeZone: 'UTC' });
  return `${month} 1`;
}

function UsageMeter({ usage }: { usage: UsageStatus }) {
  const pct = Math.min(
    100,
    Math.round((usage.used / Math.max(1, usage.limit)) * 100),
  );
  const atLimit = usage.used >= usage.limit;
  const color = atLimit ? '#ef4444' : pct >= 80 ? '#f59e0b' : '#22c55e';
  return (
    <div style={{ marginTop: 8 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 12,
          color: '#666',
        }}
      >
        <span>This month</span>
        <span>
          {usage.used.toLocaleString()} / {usage.limit.toLocaleString()}
        </span>
      </div>
      <div
        style={{
          height: 6,
          background: '#eee',
          borderRadius: 4,
          marginTop: 4,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: color,
            transition: 'width 200ms',
          }}
        />
      </div>
    </div>
  );
}

function QuotaBanner({
  usage,
  onUpgrade,
  busyUpgrade,
}: {
  usage: UsageStatus;
  onUpgrade: () => void;
  busyUpgrade: boolean;
}) {
  const isFree = usage.tier === 'free';
  const resetLabel = nextResetLabel();
  return (
    <div
      role='alert'
      style={{
        marginTop: 12,
        padding: '10px 12px',
        background: '#fef2f2',
        border: '1px solid #fecaca',
        borderRadius: 6,
        color: '#991b1b',
      }}
    >
      <div style={{ fontWeight: 600, fontSize: 13 }}>Monthly limit reached</div>
      <div style={{ fontSize: 12, marginTop: 4, color: '#7f1d1d' }}>
        You've used all {usage.limit} lookups this month. Resets {resetLabel}{' '}
        (UTC).
        {isFree && ' Upgrade to Pro for 2,000 lookups/month.'}
      </div>
      {isFree && (
        <button
          type='button'
          onClick={onUpgrade}
          disabled={busyUpgrade}
          style={{
            marginTop: 8,
            appearance: 'none',
            border: 'none',
            background: busyUpgrade ? '#d1d5db' : '#22c55e',
            color: '#fff',
            padding: '6px 10px',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
            cursor: busyUpgrade ? 'not-allowed' : 'pointer',
          }}
        >
          {busyUpgrade ? 'Opening…' : 'Upgrade to Pro (€5/mo)'}
        </button>
      )}
    </div>
  );
}

interface WordRowProps {
  word: SavedWord;
  isPending: boolean;
  onRemove: (word: SavedWord) => void;
}

const WordRow = memo(function WordRow({
  word,
  isPending,
  onRemove,
}: WordRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [senses, setSenses] = useState<WordSense[] | null>(null);
  const [loadingSenses, setLoadingSenses] = useState(false);

  const handleRemove = useCallback(() => onRemove(word), [word, onRemove]);

  const toggleExpand = useCallback(async () => {
    if (!expanded && senses === null) {
      setLoadingSenses(true);
      const res = await send({ type: 'getSenses', word: word.word, language: word.language });
      setLoadingSenses(false);
      if (res.type === 'senses') setSenses(res.senses);
    }
    setExpanded((v) => !v);
  }, [expanded, senses, word.word, word.language]);

  return (
    <li
      style={{
        padding: '8px 0',
        borderTop: '1px solid #eee',
        opacity: isPending ? 0.5 : 1,
      }}
    >
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontWeight: 600 }}>{word.word}</span>
            {word.definition.partOfSpeech && (
              <span style={{ fontStyle: 'italic', color: '#9ca3af', fontSize: 11 }}>
                {word.definition.partOfSpeech}
              </span>
            )}
          </div>
          <div style={{ color: '#333', fontSize: 13 }}>{word.definition.summary}</div>
        </div>
        <button
          type='button'
          className='vocab-expand-btn'
          onClick={toggleExpand}
          disabled={loadingSenses}
          title='Show all meanings'
          aria-label={`${expanded ? 'Hide' : 'Show'} all meanings of ${word.word}`}
        >
          {loadingSenses ? '…' : expanded ? '▴' : '▾'}
        </button>
        <button
          type='button'
          className='vocab-remove-btn'
          onClick={handleRemove}
          disabled={isPending}
          title='Remove from library'
          aria-label={`Remove ${word.word}`}
        >
          {'×'}
        </button>
      </div>
      {expanded && senses && senses.length > 1 && (
        <ol
          style={{
            margin: '6px 0 0',
            paddingLeft: 18,
            fontSize: 12,
            color: '#4b5563',
          }}
        >
          {senses.map((s) => (
            <li key={s.senseIndex} style={{ marginBottom: 3 }}>
              <span>{s.summary}</span>
              {s.partOfSpeech && (
                <span style={{ fontStyle: 'italic', color: '#9ca3af', marginLeft: 4 }}>
                  {s.partOfSpeech}
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
    </li>
  );
});

function WordList({
  words,
  onRemove,
  pendingRemoval,
}: {
  words: SavedWord[];
  onRemove: (word: SavedWord) => void;
  pendingRemoval: string | null;
}) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!q) return words;
    const out: SavedWord[] = [];
    for (const w of words) {
      if (
        w.word.toLowerCase().includes(q) ||
        w.definition.summary.toLowerCase().includes(q)
      ) {
        out.push(w);
      }
    }
    return out;
  }, [words, q]);

  const visible = filtered.slice(0, MAX_VISIBLE_ROWS);
  const hidden = filtered.length - visible.length;

  if (words.length === 0) {
    return (
      <p style={{ color: '#666', fontSize: 13, margin: '12px 0 0' }}>
        No words yet. Select a word on any page, then click "1word".
      </p>
    );
  }

  return (
    <div style={{ marginTop: 12 }}>
      <input
        type='search'
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={`Search ${words.length} word${words.length === 1 ? '' : 's'}…`}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          padding: '6px 8px',
          fontSize: 13,
          border: '1px solid #d1d5db',
          borderRadius: 6,
          outline: 'none',
        }}
      />
      {filtered.length === 0 ? (
        <p style={{ color: '#666', fontSize: 13, margin: '12px 0 0' }}>
          No matches.
        </p>
      ) : (
        <>
          <ul
            style={{
              listStyle: 'none',
              padding: 0,
              margin: '8px 0 0',
              maxHeight: 260,
              overflowY: 'auto',
            }}
          >
            {visible.map((w) => {
              const key = `${w.word}|${w.language}`;
              return (
                <WordRow
                  key={key}
                  word={w}
                  isPending={pendingRemoval === key}
                  onRemove={onRemove}
                />
              );
            })}
          </ul>
          {hidden > 0 && (
            <p
              style={{
                color: '#6b7280',
                fontSize: 11,
                margin: '6px 0 0',
                textAlign: 'center',
              }}
            >
              Showing {visible.length} of {filtered.length}. Refine your search
              to see more.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function HighlightToggle() {
  const [enabled, setEnabled] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void chrome.storage.local
      .get(STORAGE_KEYS.highlightEnabled)
      .then((res) => {
        setEnabled((res[STORAGE_KEYS.highlightEnabled] as boolean | undefined) ?? false);
        setLoaded(true);
      });
  }, []);

  const toggle = useCallback(() => {
    const next = !enabled;
    setEnabled(next);
    void chrome.storage.local.set({ [STORAGE_KEYS.highlightEnabled]: next });
  }, [enabled]);

  if (!loaded) return null;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 12,
        padding: '8px 10px',
        background: '#f9fafb',
        border: '1px solid #e5e7eb',
        borderRadius: 8,
      }}
    >
      <div>
        <div style={{ fontSize: 13, fontWeight: 500, color: '#111827' }}>
          Highlight words on page
        </div>
        <div style={{ fontSize: 11, color: '#6b7280', marginTop: 1 }}>
          Underlines saved words. Hover to preview.
        </div>
      </div>
      <button
        type='button'
        role='switch'
        aria-checked={enabled}
        onClick={toggle}
        style={{
          appearance: 'none',
          border: 'none',
          cursor: 'pointer',
          width: 40,
          height: 22,
          borderRadius: 11,
          background: enabled ? '#22c55e' : '#d1d5db',
          position: 'relative',
          transition: 'background 180ms',
          padding: 0,
          flexShrink: 0,
          marginLeft: 12,
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 3,
            left: enabled ? 21 : 3,
            width: 16,
            height: 16,
            borderRadius: '50%',
            background: '#fff',
            transition: 'left 180ms',
            boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
            display: 'block',
          }}
        />
      </button>
    </div>
  );
}

function Button({
  onClick,
  children,
  variant = 'primary',
  disabled,
}: {
  onClick: () => void;
  children: React.ReactNode;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
}) {
  const bg = variant === 'primary' ? '#22c55e' : '#f3f4f6';
  const color = variant === 'primary' ? '#fff' : '#111';
  return (
    <button
      type='button'
      onClick={onClick}
      disabled={disabled}
      style={{
        appearance: 'none',
        border: 'none',
        background: disabled ? '#d1d5db' : bg,
        color,
        padding: '8px 12px',
        borderRadius: 6,
        fontSize: 13,
        fontWeight: 500,
        cursor: disabled ? 'not-allowed' : 'pointer',
        width: '100%',
      }}
    >
      {children}
    </button>
  );
}

function App() {
  const [profile, setProfile] = useState<ProfileState | null>(null);
  const [words, setWords] = useState<SavedWord[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const refresh = useCallback(async () => {
    const p = await send({ type: 'getProfile' });
    if (p.type === 'profile') {
      setProfile({
        signedIn: p.signedIn,
        email: p.email,
        tier: p.tier,
        usage: p.usage,
      });
    }
    const w = await send({ type: 'getSavedWords' });
    if (w.type === 'savedWords') setWords(w.words);
    if (p.type === 'profile' && p.signedIn) {
      const fresh = await send({ type: 'refreshProfile' });
      if (fresh.type === 'profile' && fresh.signedIn) {
        setProfile({
          signedIn: true,
          email: fresh.email,
          tier: fresh.tier,
          usage: fresh.usage,
        });
      }
    }
  }, []);

  useEffect(() => {
    void refresh();
    const listener = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => {
      if (area !== 'local') return;
      if (
        changes[STORAGE_KEYS.savedWords] ||
        changes[STORAGE_KEYS.profile] ||
        changes[STORAGE_KEYS.usage]
      ) {
        void refresh();
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, [refresh]);

  const signIn = async () => {
    setBusy('signIn');
    setError(null);
    const res = await send({ type: 'signIn' });
    setBusy(null);
    if (res.type === 'signInResult' && !res.ok) {
      setError(res.error ?? 'Sign-in failed');
    } else {
      await refresh();
    }
  };

  const signOut = async () => {
    setBusy('signOut');
    await send({ type: 'signOut' });
    setBusy(null);
    await refresh();
  };

  const upgrade = async () => {
    setBusy('upgrade');
    const res = await send({ type: 'openCheckout' });
    setBusy(null);
    if (res.type === 'openResult' && !res.ok) {
      setError(res.error ?? "Couldn't start checkout");
    }
  };

  const portal = async () => {
    setBusy('portal');
    const res = await send({ type: 'openPortal' });
    setBusy(null);
    if (res.type === 'openResult' && !res.ok) {
      setError(res.error ?? "Couldn't open portal");
    }
  };

  const clearHistory = useCallback(async () => {
    setConfirmClear(false);
    setBusy('clearWords');
    setError(null);
    const res = await send({ type: 'clearWords' });
    setBusy(null);
    if (res.type === 'removeResult' && !res.ok) {
      setError(res.error ?? "Couldn't clear history");
    }
  }, []);

  const removeWord = useCallback(async (w: SavedWord) => {
    const key = `${w.word}|${w.language}`;
    setPendingRemoval(key);
    setError(null);
    const res = await send({
      type: 'removeWord',
      word: w.word,
      language: w.language,
    });
    setPendingRemoval(null);
    if (res.type === 'removeResult' && !res.ok) {
      setError(res.error ?? "Couldn't remove word");
    }
  }, []);

  if (!profile) {
    return <div style={{ padding: 16, color: '#666' }}>Loading…</div>;
  }

  if (!profile.signedIn) {
    return (
      <div style={{ padding: 16 }}>
        <img
          src={logoUrl}
          alt='1word'
          style={{
            display: 'block',
            margin: '0 auto 12px',
            width: 48,
            height: 48,
          }}
        />
        <p style={{ color: '#666', fontSize: 13, margin: '0 0 12px' }}>
          Select a word on any page. Get a short AI definition. See it
          underlined everywhere after.
        </p>
        <Button onClick={signIn} disabled={busy === 'signIn'}>
          {busy === 'signIn' ? 'Signing in…' : 'Sign in with Google'}
        </Button>
        {error && (
          <p style={{ color: '#ef4444', fontSize: 12, marginTop: 8 }}>
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div style={{ padding: 16 }}>
      <div style={{ textAlign: 'center', marginBottom: 4 }}>
        <img
          src={logoUrl}
          alt='1word'
          style={{
            display: 'block',
            margin: '0 auto 4px',
            width: 48,
            height: 48,
          }}
        />
        <span
          style={{
            fontSize: 11,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            color: profile.tier === 'pro' ? '#22c55e' : '#6b7280',
            fontWeight: 600,
          }}
        >
          {profile.tier}
        </span>
      </div>
      <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>
        {profile.email}
      </div>

      {profile.usage && <UsageMeter usage={profile.usage} />}

      {profile.usage && profile.usage.used >= profile.usage.limit && (
        <QuotaBanner
          usage={profile.usage}
          onUpgrade={upgrade}
          busyUpgrade={busy === 'upgrade'}
        />
      )}

      <HighlightToggle />

      <div style={{ display: 'grid', gap: 6, marginTop: 12 }}>
        {profile.tier === 'free' ? (
          !(profile.usage && profile.usage.used >= profile.usage.limit) && (
            <Button onClick={upgrade} disabled={busy === 'upgrade'}>
              {busy === 'upgrade' ? 'Opening…' : 'Upgrade to Pro (€5/mo)'}
            </Button>
          )
        ) : (
          <Button
            onClick={portal}
            variant='secondary'
            disabled={busy === 'portal'}
          >
            {busy === 'portal' ? 'Opening…' : 'Manage subscription'}
          </Button>
        )}
        <Button
          onClick={signOut}
          variant='secondary'
          disabled={busy === 'signOut'}
        >
          Sign out
        </Button>
      </div>

      {error && (
        <p style={{ color: '#ef4444', fontSize: 12, marginTop: 8 }}>{error}</p>
      )}

      {words.length > 0 && (
        <div style={{ marginTop: 12 }}>
          {confirmClear ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 10px',
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: 8,
              }}
            >
              <span style={{ flex: 1, fontSize: 12, color: '#991b1b' }}>
                Remove all {words.length} word{words.length === 1 ? '' : 's'}?
              </span>
              <button
                type='button'
                onClick={clearHistory}
                disabled={busy === 'clearWords'}
                style={{
                  appearance: 'none',
                  border: 'none',
                  background: busy === 'clearWords' ? '#d1d5db' : '#ef4444',
                  color: '#fff',
                  padding: '4px 10px',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: busy === 'clearWords' ? 'not-allowed' : 'pointer',
                  flexShrink: 0,
                }}
              >
                {busy === 'clearWords' ? 'Clearing…' : 'Clear all'}
              </button>
              <button
                type='button'
                onClick={() => setConfirmClear(false)}
                style={{
                  appearance: 'none',
                  border: '1px solid #d1d5db',
                  background: '#fff',
                  color: '#374151',
                  padding: '4px 10px',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type='button'
                className='vocab-remove-btn'
                onClick={() => setConfirmClear(true)}
                title='Clear all history'
                aria-label='Clear all history'
                style={{ fontSize: 16 }}
              >
                🗑
              </button>
            </div>
          )}
        </div>
      )}

      <WordList
        words={words}
        onRemove={removeWord}
        pendingRemoval={pendingRemoval}
      />
    </div>
  );
}

const rootEl = document.getElementById('root');
if (rootEl) createRoot(rootEl).render(<App />);
