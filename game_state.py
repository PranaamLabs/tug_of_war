import json
from fastapi import WebSocket

class Room:
    GAME_DURATION = 60  # seconds

    # Logical rope positions at which a team wins.
    # The frontend will eventually make these correspond
    # to the visible win lines.
    RED_WIN_POSITION = -100
    BLUE_WIN_POSITION = 100

    def __init__(self, room_id: str):
        self.room_id = room_id

        # Game states:
        # waiting -> countdown -> playing -> game_over
        self.status = "waiting"

        # Negative = pulled towards Red
        # Positive = pulled towards Blue
        # Zero = centre
        self.rope_position = 0

        self.red_wins = 0
        self.blue_wins = 0

        self.players = {
            "red": [],
            "blue": []
        }

        self.admins = []

        # Timer information
        self.time_remaining = self.GAME_DURATION

    async def connect(
        self,
        websocket: WebSocket,
        role: str,
        team: str = None
    ):
        await websocket.accept()

        if role == "admin":
            self.admins.append(websocket)

        elif role == "player" and team in ["red", "blue"]:
            self.players[team].append(websocket)

            # Tell everyone that the player count changed.
            await self.broadcast({
                "event": "player_joined",
                "team": team,
                "counts": {
                    "red": len(self.players["red"]),
                    "blue": len(self.players["blue"])
                }
            })

    def disconnect(
        self,
        websocket: WebSocket,
        role: str,
        team: str = None
    ):
        if role == "admin" and websocket in self.admins:
            self.admins.remove(websocket)

        elif (
            role == "player"
            and team in self.players
            and websocket in self.players[team]
        ):
            self.players[team].remove(websocket)

    async def broadcast(self, message: dict):
        """Send a JSON message to everyone in the room."""
        json_message = json.dumps(message)

        all_connections = (
            self.players["red"]
            + self.players["blue"]
            + self.admins
        )

        for connection in all_connections:
            try:
                await connection.send_text(json_message)
            except Exception:
                pass

    async def process_tap(
        self,
        team: str,
        clicks: int = 1
    ):
        # Taps only matter while the game is actually running.
        if self.status != "playing":
            return

        if team == "red":
            self.rope_position -= clicks

        elif team == "blue":
            self.rope_position += clicks

        # First check whether someone has crossed
        # the physical win line.
        winner = None

        if self.rope_position <= self.RED_WIN_POSITION:
            winner = "red"

        elif self.rope_position >= self.BLUE_WIN_POSITION:
            winner = "blue"

        # Send the new rope position to everyone.
        await self.broadcast({
            "event": "rope_update",
            "position": self.rope_position
        })

        # If someone crossed the line, finish immediately.
        if winner is not None:
            await self.end_game(winner)

    async def end_game(self, winner: str):
        """Finish the current round and record the winner."""

        if self.status == "game_over":
            return

        self.status = "game_over"

        if winner == "red":
            self.red_wins += 1

        elif winner == "blue":
            self.blue_wins += 1

        await self.broadcast({
            "event": "game_over",
            "winner": winner,
            "rope_position": self.rope_position,
            "red_wins": self.red_wins,
            "blue_wins": self.blue_wins
        })

    async def end_game_by_timer(self):
        """
        Called when the 60-second timer expires.

        Whoever has pulled the rope farther from the centre wins.
        """

        if self.status != "playing":
            return

        if self.rope_position < 0:
            winner = "red"

        elif self.rope_position > 0:
            winner = "blue"

        else:
            winner = "draw"

        if winner == "draw":
            self.status = "game_over"

            await self.broadcast({
                "event": "game_over",
                "winner": "draw",
                "rope_position": self.rope_position,
                "red_wins": self.red_wins,
                "blue_wins": self.blue_wins
            })

        else:
            await self.end_game(winner)

    def reset_game(self):
        """Prepare the room for another round."""

        self.status = "waiting"
        self.rope_position = 0
        self.time_remaining = self.GAME_DURATION

    @property
    def is_empty(self) -> bool:
        """Check if absolutely nobody is connected."""
        return (
            len(self.players["red"]) == 0
            and len(self.players["blue"]) == 0
            and len(self.admins) == 0
        )


class GameManager:
    def __init__(self):
        self.active_rooms = {}

    def get_or_create_room(self, room_id: str) -> Room:
        if room_id not in self.active_rooms:
            self.active_rooms[room_id] = Room(room_id)

        return self.active_rooms[room_id]

    def delete_room(self, room_id: str):
        """Remove a room from the active rooms dictionary."""
        if room_id in self.active_rooms:
            del self.active_rooms[room_id]


manager = GameManager()