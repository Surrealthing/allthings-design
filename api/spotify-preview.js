// Vercel serverless function — fetches a Spotify track/album's 30s preview URL
// using the Client Credentials flow. Requires env vars:
//   SPOTIFY_CLIENT_ID
//   SPOTIFY_CLIENT_SECRET
//
// Usage from client:
//   GET /api/spotify-preview?id=<albumOrTrackId>&type=album   (default: album)
//   GET /api/spotify-preview?id=<trackId>&type=track
//
// Returns: { previewUrl, name, artist, thumbnail, trackName }
// Note: not every Spotify track has a preview_url. For an album, this picks
// the first track that does.

export default async function handler(req, res) {
  const { id, type = 'album' } = req.query;
  if (!id) {
    return res.status(400).json({ error: 'missing id query param' });
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return res
      .status(500)
      .json({ error: 'SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET not set in env' });
  }

  try {
    const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization:
          'Basic ' +
          Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
      },
      body: 'grant_type=client_credentials',
    });
    if (!tokenRes.ok) {
      throw new Error(`token request failed: ${tokenRes.status}`);
    }
    const { access_token } = await tokenRes.json();

    const apiUrl =
      type === 'track'
        ? `https://api.spotify.com/v1/tracks/${id}`
        : `https://api.spotify.com/v1/albums/${id}?market=US`;

    const dataRes = await fetch(apiUrl, {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    if (!dataRes.ok) {
      throw new Error(`metadata request failed: ${dataRes.status}`);
    }
    const data = await dataRes.json();

    let previewUrl, name, artist, thumbnail, trackName;

    if (type === 'track') {
      previewUrl = data.preview_url;
      name = data.name;
      trackName = data.name;
      artist = data.artists?.[0]?.name;
      thumbnail = data.album?.images?.[0]?.url;
    } else {
      const tracks = data.tracks?.items || [];
      const withPreview = tracks.find((t) => t.preview_url);
      previewUrl = withPreview?.preview_url || null;
      name = data.name;
      trackName = withPreview?.name || tracks[0]?.name || null;
      artist = data.artists?.[0]?.name;
      thumbnail = data.images?.[0]?.url;
    }

    res.setHeader(
      'Cache-Control',
      'public, s-maxage=3600, stale-while-revalidate=86400'
    );
    return res.status(200).json({
      previewUrl,
      name,
      artist,
      thumbnail,
      trackName,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'unknown error' });
  }
}
