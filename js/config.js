let seed = null;
let pending = null;

export function loadSeed() {
  if (!pending) {
    pending = fetch('data/seed.json')
      .then((res) => {
        if (!res.ok) throw new Error('Could not load data/seed.json (HTTP ' + res.status + ')');
        return res.json();
      })
      .then((json) => {
        seed = json;
        return seed;
      })
      .catch((err) => {
        pending = null;
        throw err;
      });
  }
  return pending;
}

export function getSeed() {
  if (!seed) throw new Error('Seed data is not loaded yet. Await loadSeed() first.');
  return seed;
}
