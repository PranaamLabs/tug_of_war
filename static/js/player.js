// ==========================================
// CONNECTION SETUP
// ==========================================

const pathParts = window.location.pathname.split('/');

const roomId = pathParts[2];
const team = pathParts[3];

const protocol =
    window.location.protocol === 'https:' ? 'wss:' : 'ws:';

const wsUrl =
    `${protocol}//${window.location.host}/ws/${roomId}/player/${team}`;

const ws = new WebSocket(wsUrl);


// ==========================================
// DOM ELEMENTS
// ==========================================

const tapButton = document.getElementById('tap-button');
const ropeElement = document.getElementById('rope');
const statusDisplay = document.getElementById('status-display');
const positionDisplay = document.getElementById('position-display');


// ==========================================
// TAP BATCHING
// ==========================================

// We don't send one WebSocket message for every tap.
// Instead, collect taps for 100 ms and send them together.

let pendingTaps = 0;

const BATCH_INTERVAL_MS = 100;


// ==========================================
// PLAYER INPUT
// ==========================================

tapButton.addEventListener('click', () => {

    // Don't accept taps unless the button is enabled.
    if (tapButton.disabled) {
        return;
    }

    pendingTaps++;

    // Small visual feedback.
    tapButton.style.transform = 'scale(0.95)';

    setTimeout(() => {
        tapButton.style.transform = 'scale(1)';
    }, 50);
});


// ==========================================
// SEND BATCHED TAPS
// ==========================================

setInterval(() => {

    if (
        pendingTaps > 0 &&
        ws.readyState === WebSocket.OPEN
    ) {

        ws.send(JSON.stringify({
            event: "tap",
            clicks: pendingTaps
        }));

        pendingTaps = 0;
    }

}, BATCH_INTERVAL_MS);


// ==========================================
// CONNECTION OPEN
// ==========================================

ws.onopen = () => {

    statusDisplay.innerText =
        `Connected to ${team} team! Waiting for admin...`;

    tapButton.disabled = true;
};


// ==========================================
// SERVER MESSAGES
// ==========================================

ws.onmessage = (event) => {

    const data = JSON.parse(event.data);


    // ------------------------------------------
    // COUNTDOWN
    // ------------------------------------------

    if (data.event === "countdown") {

        statusDisplay.innerText = data.count;

        statusDisplay.style.fontSize = "3rem";
        statusDisplay.style.fontWeight = "bold";
        statusDisplay.style.color = "#333";
    }


    // ------------------------------------------
    // GAME STARTED
    // ------------------------------------------

    else if (data.event === "game_started") {

        statusDisplay.innerText =
            `GO!  ${data.time_remaining}s`;

        statusDisplay.style.fontSize = "1.2rem";

        tapButton.disabled = false;
    }


    // ------------------------------------------
    // TIMER
    // ------------------------------------------

    else if (data.event === "timer_update") {

        statusDisplay.innerText =
            `Time: ${data.time_remaining}s`;
    }


    // ------------------------------------------
    // ROPE MOVEMENT
    // ------------------------------------------

    else if (data.event === "rope_update") {
        
        positionDisplay.innerText = `Position: ${data.position}`;

        /*
         * Server position:
         *
         *     negative ← RED | BLUE → positive
         *
         * We convert the logical position into
         * a visual pixel displacement.
         */

        const visualMultiplier = 2;

        const pixelMovement =
            data.position * visualMultiplier;

        ropeElement.style.transform =
            `translateX(${pixelMovement}px)`;
    }


    // ------------------------------------------
    // GAME OVER
    // ------------------------------------------

    else if (data.event === "game_over") {

        tapButton.disabled = true;

        if (data.winner === "draw") {

            statusDisplay.innerText =
                "DRAW!";

        } else if (data.winner === team) {

            statusDisplay.innerText =
                "🎉 YOU WIN!";

        } else {

            statusDisplay.innerText =
                "YOU LOSE!";
        }
    }


    // ------------------------------------------
    // GAME RESET
    // ------------------------------------------

    else if (data.event === "game_reset") {

        tapButton.disabled = true;

        statusDisplay.innerText =
            "Waiting for admin to start...";

        ropeElement.style.transform =
            "translateX(0px)";
            
        positionDisplay.innerText = "Position: 0";
    }
};


// ==========================================
// CONNECTION CLOSED
// ==========================================

ws.onclose = () => {

    statusDisplay.innerText =
        "Disconnected from server. Please refresh.";

    tapButton.disabled = true;
};