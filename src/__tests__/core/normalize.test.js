import { describe, it, expect } from 'vitest';
import { normalizePlayniteGame, detectPlatform, stripHtml } from '../../core/normalize.js';

describe('detectPlatform', () => {
  it('detects Steam by PluginId', () => {
    expect(detectPlatform('cb91dfc9-b977-43bf-8e70-55f46e410fab')).toBe('steam');
  });

  it('detects GOG by PluginId', () => {
    expect(detectPlatform('aebe8b7c-6dc3-4a66-af31-e7375c6b5e9e')).toBe('gog');
  });

  it('detects Epic by PluginId', () => {
    expect(detectPlatform('00000002-dbd1-46c6-b5d0-b1ba559d10e4')).toBe('epic');
  });

  it('returns other for unknown PluginId', () => {
    expect(detectPlatform('unknown-guid')).toBe('other');
  });

  it('returns other for missing PluginId', () => {
    expect(detectPlatform(undefined)).toBe('other');
  });
});

describe('stripHtml', () => {
  it('removes HTML tags', () => {
    expect(stripHtml('<p class="bb">Hello <b>world</b></p>')).toBe('Hello world');
  });

  it('returns empty string for null/undefined', () => {
    expect(stripHtml(null)).toBe('');
    expect(stripHtml(undefined)).toBe('');
  });

  it('returns plain text unchanged', () => {
    expect(stripHtml('just text')).toBe('just text');
  });
});

describe('normalizePlayniteGame', () => {
  it('converts a full Playnite entry to GameRecord', () => {
    const raw = {
      Id: 'abc-123',
      Name: 'Elden Ring',
      IsInstalled: true,
      Playtime: 9360,
      LastActivity: '2024-05-11T00:00:00Z',
      PluginId: 'cb91dfc9-b977-43bf-8e70-55f46e410fab',
      GameId: '1245620',
      Description: '<p>An action RPG</p>',
      Developers: [{ Id: 'd1', Name: 'FromSoftware' }],
      Genres: [{ Id: 'g1', Name: 'RPG' }],
      ReleaseYear: 2022,
      Links: [{ Name: 'Steam', Url: 'https://store.steampowered.com/app/1245620' }],
    };

    const result = normalizePlayniteGame(raw);

    expect(result).toEqual({
      id: 'abc-123',
      name: 'Elden Ring',
      platform: 'steam',
      steamAppId: '1245620',
      totalTime: 9360,
      lastPlayed: '2024-05-11T00:00:00Z',
      isInstalled: true,
      importedAt: expect.any(String),
      description: 'An action RPG',
      coverUrl: 'https://cdn.akamai.steamstatic.com/steam/apps/1245620/header.jpg',
      developers: ['FromSoftware'],
      genres: ['RPG'],
      releaseYear: 2022,
      links: [{ name: 'Steam', url: 'https://store.steampowered.com/app/1245620' }],
    });
  });

  it('handles missing optional fields', () => {
    const raw = { Id: 'x', Name: 'Some Game' };
    const result = normalizePlayniteGame(raw);

    expect(result.name).toBe('Some Game');
    expect(result.platform).toBe('other');
    expect(result.steamAppId).toBeNull();
    expect(result.totalTime).toBe(0);
    expect(result.isInstalled).toBe(false);
    expect(result.description).toBe('');
    expect(result.coverUrl).toBeNull();
    expect(result.developers).toEqual([]);
    expect(result.genres).toEqual([]);
    expect(result.releaseYear).toBeNull();
    expect(result.links).toEqual([]);
  });

  it('returns null for entries without a name', () => {
    expect(normalizePlayniteGame({ Id: 'x' })).toBeNull();
    expect(normalizePlayniteGame(null)).toBeNull();
  });
});
