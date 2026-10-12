# The end-to-end tests against Plasma 6.8, from Arch Linux's kde-unstable
# repository (its betas and release candidates until 6.8.0 is out, then the
# release itself). KWin runs nested on its virtual backend, with a real
# plasmashell for the panel tests:
#
#   tools/test-plasma.sh 6.8 [test names...]
#
# The repository is mounted at /src when it runs; nothing of it is copied in.
FROM archlinux:latest

# kde-unstable comes before the usual repositories, so its Plasma wins.
RUN sed -i 's/^\[core\]/[kde-unstable]\nInclude = \/etc\/pacman.d\/mirrorlist\n\n[core]/' /etc/pacman.conf \
    && pacman -Syu --noconfirm --needed \
        kwin xorg-xwayland kglobalacceld kactivitymanagerd qt6-wayland breeze \
        kirigami qt6-declarative kpackage kconfig libkscreen qt6-tools \
        mesa dbus python python-dbus python-gobject python-pillow pyside6 \
        ttf-dejavu libcap git \
        plasma-workspace plasma-desktop zenity \
    && pacman -Scc --noconfirm

# As in the 6.6 image: a container leaves out CAP_SYS_NICE, and the kernel
# then refuses to run a file that asks for it.
RUN setcap -r /usr/bin/kwin_wayland || true

RUN mkdir -p /tmp/.X11-unix && chmod 1777 /tmp/.X11-unix
RUN command -v qdbus6 >/dev/null || ln -s /usr/lib/qt6/bin/qdbus /usr/local/bin/qdbus6

RUN useradd --create-home --uid 1000 tester \
    && mkdir -p /run/user/1000 && chown 1000:1000 /run/user/1000 && chmod 700 /run/user/1000
USER 1000
ENV XDG_RUNTIME_DIR=/run/user/1000 \
    LIBGL_ALWAYS_SOFTWARE=1
WORKDIR /src
CMD ["python3", "tests/e2e/run.py"]
