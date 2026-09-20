"""Minimal Wayland client for KWin's org_kde_kwin_fake_input protocol.

Speaks the Wayland wire protocol directly over the sandbox compositor's
socket, so tests can press real keys and drag with the mouse. KWin only
offers this protocol to arbitrary clients when started with
KWIN_WAYLAND_NO_PERMISSION_CHECKS=1, which the sandbox does. Never point
this at a real session.
"""
import os
import socket
import struct
import time

# evdev codes
KEYS = {
    "meta": 125, "shift": 42, "ctrl": 29, "alt": 56, "tab": 15, "left": 105, "right": 106, "up": 103, "down": 108,
    "minus": 12, "equal": 13, "grave": 41, "escape": 1, "return": 28, "space": 57,
}
KEYS.update({str(i): 1 + i for i in range(1, 10)})
KEYS["0"] = 11
KEYS.update({c: code for c, code in zip("qwertyuiop", range(16, 26))})
KEYS.update({c: code for c, code in zip("asdfghjkl", range(30, 39))})
KEYS.update({c: code for c, code in zip("zxcvbnm", range(44, 51))})
BTN_LEFT, BTN_RIGHT = 0x110, 0x111

# org_kde_kwin_fake_input request opcodes
AUTHENTICATE, POINTER_MOTION, BUTTON, AXIS = 0, 1, 2, 3
POINTER_MOTION_ABSOLUTE, KEYBOARD_KEY = 9, 10


def _string(s):
    b = s.encode() + b"\0"
    pad = (4 - len(b) % 4) % 4
    return struct.pack("<I", len(b)) + b + b"\0" * pad


def _fixed(v):
    return struct.pack("<i", int(round(v * 256)))


class FakeInput:
    def __init__(self, display, runtime_dir=None):
        path = os.path.join(runtime_dir or os.environ["XDG_RUNTIME_DIR"], display)
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.connect(path)
        self.next_id = 2
        self.buf = b""
        self.globals = {}
        registry = self._new_id()
        self._send(1, 1, struct.pack("<I", registry))  # wl_display.get_registry
        self._roundtrip(registry)
        if "org_kde_kwin_fake_input" not in self.globals:
            raise RuntimeError("compositor does not offer org_kde_kwin_fake_input")
        name, version = self.globals["org_kde_kwin_fake_input"]
        self.fake = self._new_id()
        # wl_registry.bind(name, new_id<interface, version, id>)
        self._send(registry, 0, struct.pack("<I", name) + _string("org_kde_kwin_fake_input") +
                   struct.pack("<II", min(version, 4), self.fake))
        self._send(self.fake, AUTHENTICATE, _string("hyprkwin-tests") + _string("end-to-end tests"))
        self.sync()

    def _new_id(self):
        i = self.next_id
        self.next_id += 1
        return i

    def _send(self, obj, opcode, payload=b""):
        size = 8 + len(payload)
        self.sock.sendall(struct.pack("<II", obj, (size << 16) | opcode) + payload)

    def _read_event(self):
        while len(self.buf) < 8:
            self.buf += self.sock.recv(65536)
        obj, word = struct.unpack("<II", self.buf[:8])
        size, opcode = word >> 16, word & 0xFFFF
        while len(self.buf) < size:
            self.buf += self.sock.recv(65536)
        payload, self.buf = self.buf[8:size], self.buf[size:]
        return obj, opcode, payload

    def _roundtrip(self, registry=None):
        cb = self._new_id()
        self._send(1, 0, struct.pack("<I", cb))  # wl_display.sync
        while True:
            obj, opcode, payload = self._read_event()
            if obj == cb and opcode == 0:
                return
            if obj == 1 and opcode == 0:
                raise RuntimeError("wayland protocol error: %r" % payload)
            if registry is not None and obj == registry and opcode == 0:
                name = struct.unpack("<I", payload[:4])[0]
                n = struct.unpack("<I", payload[4:8])[0]
                iface = payload[8:8 + n - 1].decode()
                off = 8 + n + (4 - n % 4) % 4
                version = struct.unpack("<I", payload[off:off + 4])[0]
                self.globals[iface] = (name, version)

    def sync(self):
        self._roundtrip()

    # -- input -------------------------------------------------------------

    def key(self, name, pressed):
        self._send(self.fake, KEYBOARD_KEY, struct.pack("<II", KEYS[name], 1 if pressed else 0))

    def combo(self, spec, delay=0.05):
        """Press a combination like "meta+shift+left"."""
        names = spec.lower().split("+")
        for n in names:
            self.key(n, True)
        self.sync()
        time.sleep(delay)
        for n in reversed(names):
            self.key(n, False)
        self.sync()

    def move_to(self, x, y):
        self._send(self.fake, POINTER_MOTION_ABSOLUTE, _fixed(x) + _fixed(y))
        self.sync()

    def button(self, btn, pressed):
        self._send(self.fake, BUTTON, struct.pack("<II", btn, 1 if pressed else 0))
        self.sync()

    def click(self, x, y, btn=BTN_LEFT):
        self.move_to(x, y)
        time.sleep(0.05)
        self.button(btn, True)
        time.sleep(0.05)
        self.button(btn, False)

    def drag(self, start, end, btn=BTN_LEFT, modifiers=(), steps=12):
        self.move_to(*start)
        for m in modifiers:
            self.key(m, True)
        self.sync()
        time.sleep(0.05)
        self.button(btn, True)
        time.sleep(0.1)
        for i in range(1, steps + 1):
            t = i / steps
            self.move_to(start[0] + (end[0] - start[0]) * t, start[1] + (end[1] - start[1]) * t)
            time.sleep(0.02)
        time.sleep(0.1)
        self.button(btn, False)
        for m in reversed(modifiers):
            self.key(m, False)
        self.sync()

    def close(self):
        self.sock.close()
