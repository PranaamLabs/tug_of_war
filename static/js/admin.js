// ==========================================
// DOM ELEMENTS
// ==========================================

const setupSection = document.getElementById('setup-section');
const dashboardSection = document.getElementById('dashboard-section');

const roomInput = document.getElementById('room-input');
const connectBtn = document.getElementById('connect-btn');

const startBtn = document.getElementById('start-btn');

const adminStatus = document.getElementById('admin-status');
const displayRoomId = document.getElementById('display-room-id');

const redCountDisplay = document.getElementById('red-count');
const blueCountDisplay = document.getElementById('blue-count');


// ==========================================
// STATE
// ==========================================

let ws = null;
let currentRoom = "";


// ==========================================
// CONNECT TO ROOM
// ==========================================

connectBtn.addEventListener('click', () => {

    const roomId = roomInput.value.trim();

    if (!roomId) {
        alert("Please enter a room ID");
        return;
    }

    currentRoom = roomId;

    const protocol =
        window.location.protocol === 'https:' ? 'wss:' : 'ws:';

    const wsUrl =
        `${protocol}//${window.location.host}/ws/${currentRoom}/admin/none`;

    ws = new WebSocket(wsUrl);


    // --------------------------------------
    // CONNECTION OPEN
    // --------------------------------------

    ws.onopen = () => {

        setupSection.style.display = 'none';
        dashboardSection.style.display = 'block';

        displayRoomId.innerText = currentRoom;

        adminStatus.innerText =
            "Room open. Players can now join.";

        startBtn.disabled = false;
        startBtn.innerText = "Start Round";
    };


    // --------------------------------------
    // SERVER MESSAGES
    // --------------------------------------

    ws.onmessage = (event) => {

        const data = JSON.parse(event.data);


        // ==================================
        // PLAYER JOINED / LEFT
        // ==================================

        if (
            data.event === "player_joined" ||
            data.event === "player_left"
        ) {

            redCountDisplay.innerText =
                data.counts?.red ?? 0;

            blueCountDisplay.innerText =
                data.counts?.blue ?? 0;
        }


        // ==================================
        // COUNTDOWN
        // ==================================

        else if (data.event === "countdown") {

            adminStatus.innerText =
                `Starting in ${data.count}...`;
        }


        // ==================================
        // GAME STARTED
        // ==================================

        else if (data.event === "game_started") {

            adminStatus.innerText =
                `GAME LIVE — ${data.time_remaining}s`;

            startBtn.disabled = true;
            startBtn.innerText = "Round in Progress";
        }


        // ==================================
        // TIMER
        // ==================================

        else if (data.event === "timer_update") {

            adminStatus.innerText =
                `GAME LIVE — ${data.time_remaining}s`;
        }


        // ==================================
        // ROPE UPDATE
        // ==================================

        else if (data.event === "rope_update") {

            adminStatus.innerText =
                `Rope Position: ${data.position}`;
        }


        // ==================================
        // GAME OVER
        // ==================================

        else if (data.event === "game_over") {

            startBtn.disabled = false;
            startBtn.innerText = "Start Next Round";

            if (data.winner === "draw") {

                adminStatus.innerText =
                    "DRAW!";

            } else {

                adminStatus.innerText =
                    `${data.winner.toUpperCase()} TEAM WINS!`;
            }
        }


        // ==================================
        // RESET
        // ==================================

        else if (data.event === "game_reset") {

            startBtn.disabled = false;
            startBtn.innerText = "Start Round";

            adminStatus.innerText =
                "Room reset. Ready for next round.";
        }
    };


    // --------------------------------------
    // CONNECTION CLOSED
    // --------------------------------------

    ws.onclose = () => {

        adminStatus.innerText =
            "Disconnected from server. Please refresh.";

        startBtn.disabled = true;
    };
});


// ==========================================
// START ROUND
// ==========================================

startBtn.addEventListener('click', () => {

    if (
        !ws ||
        ws.readyState !== WebSocket.OPEN
    ) {
        return;
    }

    if (startBtn.innerText === "Start Next Round") {
        ws.send(JSON.stringify({
            event: "reset_game"
        }));
    }


    // --------------------------------------
    // Disable button during countdown
    // --------------------------------------

    startBtn.disabled = true;


    // --------------------------------------
    // 3 → 2 → 1
    // --------------------------------------

    let count = 3;

    ws.send(JSON.stringify({
        event: "countdown",
        count: count
    }));

    startBtn.innerText =
        `Starting in ${count}...`;


    const countdownInterval =
        setInterval(() => {

            count--;

            if (count > 0) {

                ws.send(JSON.stringify({
                    event: "countdown",
                    count: count
                }));

                startBtn.innerText =
                    `Starting in ${count}...`;

            } else {

                clearInterval(countdownInterval);

                ws.send(JSON.stringify({
                    event: "start_game"
                }));
            }

        }, 1000);
});
