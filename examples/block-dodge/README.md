# Block Dodge

Move left and right to dodge falling blocks for 30 seconds. Run `npm run dodge`
from the repository root and open [the local game](http://localhost:3300/).
Use the arrow keys to steer and **Esc** to pause or resume.

With phone steering selected, the rounded **Play/Pause** button starts,
pauses, resumes, or retries a round from the phone.

## Check phone fallback

Open the game on an address both devices can reach. For a temporary HTTPS
address, run `npx.cmd cloudflared tunnel --url http://localhost:3300` and open
the printed address on the computer.

1. Start a round with the keyboard. Select **Connect phone** to show the QR.
2. Scan it, then select **Use phone steering**. Hold the stick to one side and
   close the controller tab or switch away from it.
3. The game pauses and keeps the timer and score. Select **Continue with
   keyboard** to resume the same round. If the phone reconnects, the keyboard
   stays active until you choose the phone again.
4. For phone recovery, interrupt the phone again and choose **Reconnect phone**.
   Return to the controller or scan the QR. Select **Resume with phone** once
   the phone is available.

## Integration trial

The keyboard-only game was built and checked first. A separate coding agent
added the phone using the packed npm modules, `AGENT_README.md`, and the MCP
capability and validation tools. The game owns the pause screen and chooses
when to resume. mobControl supplies steering and connection events.
