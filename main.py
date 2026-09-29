import asyncio
import json

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from game_state import manager


app = FastAPI()

app.mount(
    "/static",
    StaticFiles(directory="static"),
    name="static"
)

templates = Jinja2Templates(directory="templates")


# ==========================================
# HTTP ROUTES
# ==========================================

@app.get("/")
async def join_page(request: Request):
    """Main lobby where players choose a room and team."""
    return templates.TemplateResponse(
        request=request,
        name="join.html",
        context={"request": request}
    )


@app.get("/play/{room_id}/{team}")
async def game_page(
    request: Request,
    room_id: str,
    team: str
):
    """Player game screen."""
    return templates.TemplateResponse(
        request=request,
        name="game.html",
        context={
            "request": request,
            "room_id": room_id,
            "team": team
        }
    )


@app.get("/admin")
async def admin_page(request: Request):
    """Admin control panel."""
    return templates.TemplateResponse(
        request=request,
        name="admin.html",
        context={"request": request}
    )

async def run_game_timer(room):
    """
    Server-authoritative 60-second game timer.

    The browser displays the timer, but the server
    decides when the round actually ends.
    """

    while room.status == "playing" and room.time_remaining > 0:

        await asyncio.sleep(1)

        # The game might have ended because the rope
        # crossed a winning line during this second.
        if room.status != "playing":
            return

        room.time_remaining -= 1

        await room.broadcast({
            "event": "timer_update",
            "time_remaining": room.time_remaining
        })

    # Timer reached zero.
    if room.status == "playing":
        await room.end_game_by_timer()


# ==========================================
# WEBSOCKET
# ==========================================

@app.websocket("/ws/{room_id}/{role}/{team}")
async def websocket_endpoint(
    websocket: WebSocket,
    room_id: str,
    role: str,
    team: str
):
    """
    Handles all real-time communication.

    role:
        player
        admin

    team:
        red
        blue
        none (admin)
    """

    # ------------------------------------------
    # Validate connection
    # ------------------------------------------

    if role not in ("player", "admin"):
        await websocket.close(code=1008)
        return

    if role == "player" and team not in ("red", "blue"):
        await websocket.close(code=1008)
        return

    if role == "admin" and team != "none":
        await websocket.close(code=1008)
        return

    # ------------------------------------------
    # Connect to room
    # ------------------------------------------

    room = manager.get_or_create_room(room_id)

    await room.connect(
        websocket,
        role,
        team
    )

    try:

        # --------------------------------------
        # Listen for messages
        # --------------------------------------

        while True:

            data = await websocket.receive_text()
            message = json.loads(data)

            event = message.get("event")

            # ==================================
            # PLAYER: TAP
            # ==================================

            if event == "tap" and role == "player":

                await room.process_tap(
                    team,
                    message.get("clicks", 1)
                )

            # ==================================
            # ADMIN: COUNTDOWN
            # ==================================

            elif event == "countdown" and role == "admin":

                # Only allow countdown while waiting.
                if room.status not in ("waiting", "countdown"):
                    continue

                room.status = "countdown"

                await room.broadcast({
                    "event": "countdown",
                    "count": message.get("count")
                })

            # ==================================
            # ADMIN: START GAME
            # ==================================

            elif event == "start_game" and role == "admin":

                # Don't start a second game accidentally.
                if room.status != "countdown":
                    continue

                room.status = "playing"
                room.time_remaining = room.GAME_DURATION

                await room.broadcast({
                    "event": "game_started",
                    "time_remaining": room.time_remaining
                })

                # Start the authoritative server timer.
                asyncio.create_task(
                    run_game_timer(room)
                )

            # ==================================
            # ADMIN: RESET GAME
            # ==================================

            elif event == "reset_game" and role == "admin":

                room.reset_game()

                await room.broadcast({
                    "event": "game_reset",
                    "position": room.rope_position,
                    "time_remaining": room.time_remaining,
                    "red_wins": room.red_wins,
                    "blue_wins": room.blue_wins
                })


    except WebSocketDisconnect:

        room.disconnect(
            websocket,
            role,
            team
        )

        # Tell everyone that a player left.
        await room.broadcast({
            "event": "player_left",
            "team": team,
            "counts": {
                "red": len(room.players["red"]),
                "blue": len(room.players["blue"])
            }
        })


# ==========================================
# RUN SERVER
# ==========================================

# if __name__ == "__main__":
#     uvicorn.run(
#         "main:app",
#         host="0.0.0.0",
#         port=8000,
#         reload=True
#     )