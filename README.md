# KOBENI-MD

KOBENI-MD is a WhatsApp bot project built on top of the `@whiskeysockets/baileys` library. It features a modular architecture, allowing for easy plugin management and dynamic command reloading without restarting the bot. The project also includes a conversational AI component, "Kobeni," which can interact with users and trigger specific commands based on context.

### Features
*   **Modular Plugin System:** Easily add or modify functionality by dropping files into the `system/plugins` directory.
*   **Dynamic Reloading:** Plugins and handlers are watched for changes, enabling near-instant updates.
*   **Kobeni AI:** An integrated AI agent capable of holding conversations and executing commands through natural language processing.
*   **Multi-Device Support:** Designed to work across WhatsApp sessions.
*   **Flexible Access Control:** Manage bot usage with Public/Self modes and specific user access levels.

### Prerequisites
*   Node.js (v18+)
*   Npm

### Getting Started

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/kagenouReal/Kobeni-MD.git
    cd Kobeni-MD
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Run the bot:**
    ```bash
    npm start
    ```

### Status
This project is currently in **Beta**. Expect frequent changes and potential instability as features are being developed and tested.

### License
This project is open-source. See the license file for details.
