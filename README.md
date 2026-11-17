# Stick Duel

Two procedurally-animated stick fighters. Climb walls, shoot, new random room every game.
Plain HTML/JS, no build step. Online play is peer-to-peer (WebRTC via PeerJS).

## Host it on GitHub Pages
1. Create a new GitHub repository and upload every file in this folder (keep them in the repo root).
2. Repo **Settings → Pages → Build and deployment → Deploy from a branch → `main` / `(root)` → Save**.
3. After a minute your game is live at `https://<your-username>.github.io/<repo-name>/`.

## Play online
1. Player 1 opens the site → **Create online room** → sends the 5-letter code or the invite link.
2. Player 2 opens the link (or **Join a friend's room** and types the code).
3. The game starts automatically. Host = cyan, guest = orange. Host presses **R** for a new room.

## Controls
| | Move | Jump | Shoot |
|---|---|---|---|
| Keyboard (local P1) | WASD | Space | F |
| Keyboard (local P2) | Arrows | . | , |
| Online (either) | WASD or Arrows | Space or . | F or , |
| Gamepad | left stick / D-pad | A | X / RB / RT |
| Touch | own joystick | JUMP button | SHOOT button |

Hold toward a wall to grab it, up/down to climb, jump to wall-jump. **M** mutes, **Esc** opens the menu.

## Notes
- Needs HTTPS (GitHub Pages is) for clipboard + WebRTC.
- Uses PeerJS's free public signaling server and Google STUN. Very strict networks (some school/corporate
  Wi-Fi, some mobile carriers) can block direct connections; a TURN server would be needed there.
- The host runs the simulation, so the host has zero input lag; the guest feels roughly the round-trip ping.
