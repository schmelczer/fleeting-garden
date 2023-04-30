export const handleFullScreen = ({
  minimizeButton,
  maximizeButton,
  target,
}: {
  minimizeButton: HTMLElement;
  maximizeButton: HTMLElement;
  target: HTMLElement;
}) => {
  if (!document.fullscreenEnabled) {
    minimizeButton.style.visibility = 'hidden';
    maximizeButton.style.visibility = 'hidden';
    return;
  }

  const isInFullScreen = (): boolean => document.fullscreenElement !== null;
  const updateButtons = () => {
    minimizeButton.style.visibility = isInFullScreen() ? 'visible' : 'hidden';
    maximizeButton.style.visibility = isInFullScreen() ? 'hidden' : 'visible';
  };

  updateButtons();

  addEventListener('keydown', (e) => {
    // on full screen request, only apply it to the target
    if (e.key === 'F11') {
      e.preventDefault();
      isInFullScreen() ? document.exitFullscreen() : target.requestFullscreen();
    }
  });

  addEventListener('fullscreenchange', updateButtons);

  maximizeButton.addEventListener('click', target.requestFullscreen.bind(target));
  minimizeButton.addEventListener('click', document.exitFullscreen.bind(document));
};
