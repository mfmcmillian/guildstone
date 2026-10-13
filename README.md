# Antrom Guildstone Ring

Decentraland SDK7 smart wearable: the Knights of Antrom AFK idle loop as a portable experience. Wear the ring and the Antrom AFK HUD follows you anywhere in Decentraland. Progress is shared with the AntromAFK land scene through the same backend and player profile.

- Pick a profession from the dock (Lumberjack, Miner, Butcher, Assassin); a gather cycle runs every 3 seconds.
- Depot, Craft, Tool Bench and Shop open the same panels as the land scene.
- Guild tab with officer tools (ranks, kick, transfer, disband, settings).

## Commands

```bash
npm install
npm run start -- --web3   # preview in the desktop client (wallet required for the backend)
npm run build             # type-check and bundle bin/game.js
npm run pack              # produce smart-wearable.zip for the Builder (2 MB uncompressed cap)
```

## Project layout

- `src/index.ts`: entry point (`main()`).
- `src/work.ts`: profession loop (replaces the land scene's zones).
- `src/ui/dock.tsx`: wearable-only dock (profession picker + station buttons).
- `src/ui/*`, `src/state.ts`, `src/transactions.ts`, `src/playerProfile.ts`, `src/backpackPersistence.ts`: shared with AntromAFK.
- `wearable.json`: Builder metadata (hands_wear, legendary, `antrom_guildstone_ring.glb`).
- `scene.json`: `isPortableExperience: true`, `requiredPermissions: ["USE_FETCH"]`.

## Publishing

Upload `smart-wearable.zip` as a new item in the Builder (category Hands Wear). `images/icons` are downscaled to 128 px to stay under the size cap; keep new assets small.
