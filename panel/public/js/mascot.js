// Kobeni Assistant Original Pixel Art Mascot Generator & State Handler
export const Mascot = {
  // Returns responsive SVG pixel art of Kobeni
  renderSvg(mood = "happy", size = 80) {
    let eyesSvg = "";
    let mouthSvg = "";
    let accessorySvg = "";

    if (mood === "happy" || mood === "online") {
      // Sparkling violet eyes, happy smile, blush
      eyesSvg = `
        <!-- Left Eye (Violet) -->
        <rect x="24" y="32" width="6" height="8" fill="#7c3aed" />
        <rect x="25" y="33" width="2" height="3" fill="#ffffff" />
        <rect x="24" y="30" width="7" height="2" fill="#311042" />
        <!-- Right Eye (Violet) -->
        <rect x="42" y="32" width="6" height="8" fill="#7c3aed" />
        <rect x="43" y="33" width="2" height="3" fill="#ffffff" />
        <rect x="41" y="30" width="7" height="2" fill="#311042" />
        <!-- Cute Blush -->
        <rect x="20" y="40" width="6" height="3" fill="#f472b6" opacity="0.8" />
        <rect x="46" y="40" width="6" height="3" fill="#f472b6" opacity="0.8" />
      `;
      mouthSvg = `
        <!-- Smiling Mouth -->
        <path d="M 33 42 Q 36 46 39 42" stroke="#4c0519" stroke-width="2" fill="#fda4af" />
      `;
      accessorySvg = `
        <!-- Sparkling star -->
        <path d="M 56 16 L 58 20 L 62 21 L 58 22 L 56 26 L 54 22 L 50 21 L 54 20 Z" fill="#fbbf24" />
      `;
    } else if (mood === "worried" || mood === "stopped") {
      // Slanted worried eyes, small straight mouth, sweat drop
      eyesSvg = `
        <rect x="24" y="34" width="6" height="6" fill="#6d28d9" />
        <rect x="25" y="35" width="2" height="2" fill="#ffffff" />
        <path d="M 23 31 L 30 33" stroke="#311042" stroke-width="2" />
        <rect x="42" y="34" width="6" height="6" fill="#6d28d9" />
        <rect x="43" y="35" width="2" height="2" fill="#ffffff" />
        <path d="M 49 31 L 42 33" stroke="#311042" stroke-width="2" />
      `;
      mouthSvg = `
        <rect x="33" y="43" width="6" height="2" fill="#4c0519" />
      `;
      accessorySvg = `
        <!-- Blue Sweat drop -->
        <path d="M 52 26 C 52 24 55 20 55 20 C 55 20 58 24 58 26 C 58 28 56 30 55 30 C 54 30 52 28 52 26 Z" fill="#38bdf8" />
      `;
    } else if (mood === "error" || mood === "crashed") {
      // Dizzy or panicked spiral eyes, wavy mouth
      eyesSvg = `
        <!-- Dizzy X or Panic Eyes -->
        <path d="M 24 32 L 30 38 M 30 32 L 24 38" stroke="#7c3aed" stroke-width="2.5" />
        <path d="M 42 32 L 48 38 M 48 32 L 42 38" stroke="#7c3aed" stroke-width="2.5" />
        <!-- Heavy Blush / Embarrassment -->
        <rect x="18" y="40" width="8" height="3" fill="#f43f5e" />
        <rect x="46" y="40" width="8" height="3" fill="#f43f5e" />
      `;
      mouthSvg = `
        <path d="M 31 43 Q 33 40 36 43 Q 39 46 41 43" stroke="#4c0519" stroke-width="2" fill="none" />
      `;
      accessorySvg = `
        <!-- Panic marks -->
        <path d="M 14 18 L 18 22 M 16 16 L 20 20" stroke="#f43f5e" stroke-width="2" />
      `;
    } else {
      // Reconnecting / Starting
      eyesSvg = `
        <rect x="24" y="33" width="6" height="7" fill="#7c3aed" />
        <rect x="25" y="34" width="2" height="2" fill="#ffffff" />
        <rect x="42" y="33" width="6" height="7" fill="#7c3aed" />
        <rect x="43" y="34" width="2" height="2" fill="#ffffff" />
      `;
      mouthSvg = `
        <ellipse cx="36" cy="43" rx="3" ry="2" fill="#fda4af" stroke="#4c0519" stroke-width="1.5" />
      `;
    }

    return `
      <svg width="${size}" height="${size}" viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg" class="select-none">
        <!-- Coral-Pink Twin Tails Hair (Mikakunin Kobeni Style) -->
        <path d="M 12 28 Q 6 36 8 48 Q 14 54 18 42 Z" fill="#fb7185" />
        <path d="M 60 28 Q 66 36 64 48 Q 58 54 54 42 Z" fill="#fb7185" />
        <path d="M 14 26 L 18 28 L 16 32 Z" fill="#e11d48" /> <!-- Hair ties -->
        <path d="M 58 26 L 54 28 L 56 32 Z" fill="#e11d48" />

        <!-- Base Hair Back -->
        <ellipse cx="36" cy="32" rx="20" ry="18" fill="#f43f5e" />

        <!-- Face / Skin -->
        <rect x="22" y="24" width="28" height="26" rx="6" fill="#ffedd5" />
        <path d="M 24 44 Q 36 53 48 44 Z" fill="#ffedd5" />

        <!-- Front Coral Bangs -->
        <path d="M 20 22 C 28 18 44 18 52 22 C 50 28 48 30 46 29 C 42 27 40 31 36 28 C 32 31 30 27 26 29 C 24 30 22 28 20 22 Z" fill="#fb7185" />

        <!-- Eyes, Mouth, Accessories -->
        ${eyesSvg}
        ${mouthSvg}
        ${accessorySvg}

        <!-- Sailor Uniform Collar (Navy + Red Bow) -->
        <path d="M 22 52 L 50 52 L 48 68 L 24 68 Z" fill="#1e1b4b" />
        <path d="M 28 52 L 36 60 L 44 52" fill="#f8fafc" stroke="#1e1b4b" stroke-width="1.5" />
        <!-- Red Bow -->
        <path d="M 33 56 L 30 62 L 36 59 L 42 62 L 39 56 Z" fill="#e11d48" />
      </svg>
    `;
  },

  getDialogue(status) {
    switch (status) {
      case "ONLINE":
        return {
          mood: "happy",
          title: "ONLINE & HEALTHY",
          text: "Master, Kobeni-MD is connected to WhatsApp! All plugins and commands are ready to serve.",
          color: "text-emerald-600",
        };
      case "PAIRING":
        return {
          mood: "worried",
          title: "AWAITING PAIRING",
          text: "U-um... Please enter the pairing code in your WhatsApp linked devices to connect me!",
          color: "text-amber-600",
        };
      case "RECONNECTING":
        return {
          mood: "worried",
          title: "RECONNECTING...",
          text: "Connection was interrupted! Hold on, I'm trying to reconnect right now...",
          color: "text-amber-600",
        };
      case "STOPPED":
        return {
          mood: "worried",
          title: "MAIN BOT STOPPED",
          text: "A-awawa! Main bot is currently stopped. Click [START] to wake me up!",
          color: "text-rose-600",
        };
      case "CRASHED":
        return {
          mood: "error",
          title: "BOT CRASHED",
          text: "E-eh?! Something went wrong! Please check the terminal logs for error traces.",
          color: "text-rose-600",
        };
      default:
        return {
          mood: "happy",
          title: "KOBENI CONTROL",
          text: "Welcome back! What would you like to inspect today?",
          color: "text-[#1d99f3]",
        };
    }
  }
};
