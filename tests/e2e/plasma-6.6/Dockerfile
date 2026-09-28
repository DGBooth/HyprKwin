# The end-to-end tests against Plasma 6.6, as Ubuntu 26.04 LTS ships it
# (KWin 6.6.6). KWin runs nested on its virtual backend with software
# rendering, so no GPU or display is needed:
#
#   tools/test-plasma-6.6.sh [test names...]
#
# The repository is mounted at /src when it runs; nothing of it is copied in.
FROM ubuntu:26.04

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
        kwin-wayland kwin-common xwayland kglobalacceld qt6-wayland kwin-style-breeze \
        qml6-module-org-kde-kirigami qml6-module-qtquick-shapes qml6-module-qtquick-controls \
        qml6-module-qtquick-layouts qml6-module-qtquick-window qml6-module-qtquick-templates \
        qml6-module-qtcore qml6-module-qt-labs-folderlistmodel \
        libgl1-mesa-dri libegl-mesa0 mesa-libgallium \
        dbus dbus-bin dbus-daemon qdbus-qt6 kpackagetool6 libkf6config-bin libkscreen-bin \
        python3 python3-dbus python3-gi python3-pil \
        python3-pyside6.qtcore python3-pyside6.qtgui python3-pyside6.qtwidgets \
        fonts-dejavu-core ca-certificates libcap2-bin \
    && rm -rf /var/lib/apt/lists/*

# kwin_wayland is installed with CAP_SYS_NICE, for real-time scheduling. A
# container's default capabilities leave that out, and the kernel then refuses
# to run the file at all ("Operation not permitted"); the tests don't need it.
RUN setcap -r /usr/bin/kwin_wayland

# Where Xwayland puts its socket; a booted system makes it, a container doesn't,
# and an ordinary user cannot.
RUN mkdir -p /tmp/.X11-unix && chmod 1777 /tmp/.X11-unix

# The tests call qdbus6; Ubuntu may only ship it under Qt's own bin folder.
RUN command -v qdbus6 >/dev/null || ln -s /usr/lib/qt6/bin/qdbus /usr/local/bin/qdbus6

# An ordinary user with its own runtime folder, as in a real session. Ubuntu's
# image already has one (ubuntu, uid 1000); older ones get tester.
RUN (getent passwd 1000 >/dev/null || useradd --create-home --uid 1000 tester) \
    && mkdir -p /run/user/1000 && chown 1000:1000 /run/user/1000 && chmod 700 /run/user/1000
USER 1000
ENV XDG_RUNTIME_DIR=/run/user/1000 \
    LIBGL_ALWAYS_SOFTWARE=1
WORKDIR /src
CMD ["python3", "tests/e2e/run.py"]
