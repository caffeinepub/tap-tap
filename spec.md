# Tap Tap Game

## Current State
New project, no existing app.

## Requested Changes (Diff)

### Add
- A fully playable Tap Tap rhythm game in the browser
- Falling note lanes (4 lanes) with circles/notes dropping from top to bottom
- Hit zone at the bottom of each lane - player taps/clicks to hit notes
- Score system with combo multiplier (Perfect, Good, Miss)
- Visual feedback per hit (flash/glow effects)
- Lives or health bar - game over on too many misses
- Start screen and game over screen
- Background music beat / auto-generated note patterns
- High score tracking (local)

### Modify
- None

### Remove
- None

## Implementation Plan
1. Build a React game component with canvas or DOM-based lanes
2. Implement game loop using requestAnimationFrame
3. Generate note patterns procedurally at random intervals per lane
4. Detect player taps (mouse click / touch) on each lane
5. Score notes based on timing accuracy relative to hit zone
6. Display score, combo, lives on HUD
7. Start/pause/game-over state management
8. Local high score storage via localStorage
