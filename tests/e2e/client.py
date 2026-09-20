#!/usr/bin/env python3
"""Tiny Wayland test client: a coloured window with a given title and app id."""
import argparse
import random
import sys

from PySide6.QtCore import QSize, Qt
from PySide6.QtGui import QColor, QGuiApplication, QPainter
from PySide6.QtWidgets import QApplication, QDialog, QWidget


class Canvas(QWidget):
    def __init__(self, title, color=None):
        super().__init__()
        self.color = QColor(color) if color else QColor.fromHsvF(random.random(), 0.5, 0.8)
        self.setWindowTitle(title)

    def paintEvent(self, _):
        p = QPainter(self)
        p.fillRect(self.rect(), self.color)
        p.setPen(Qt.black)
        f = p.font()
        f.setPixelSize(28)
        p.setFont(f)
        p.drawText(self.rect(), Qt.AlignCenter, self.windowTitle())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--title", default="client")
    ap.add_argument("--app-id", default="hyprkwin.test")
    ap.add_argument("--size", default="400x300")
    ap.add_argument("--fixed", action="store_true", help="fixed size (min == max)")
    ap.add_argument("--dialog", action="store_true", help="open a transient dialog too")
    ap.add_argument("--color", help="fill colour, e.g. #ff0000 (default: random)")
    args = ap.parse_args()

    QGuiApplication.setDesktopFileName(args.app_id)
    app = QApplication(sys.argv[:1])
    w, h = (int(v) for v in args.size.split("x"))
    win = Canvas(args.title, args.color)
    win.resize(w, h)
    if args.fixed:
        win.setFixedSize(QSize(w, h))
    win.show()
    if args.dialog:
        d = QDialog(win)
        d.setWindowTitle(args.title + " dialog")
        d.resize(300, 200)
        d.show()
    sys.exit(app.exec())


if __name__ == "__main__":
    main()
