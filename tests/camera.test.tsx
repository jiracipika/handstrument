import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CameraView from '../src/components/CameraView';

const trackStop = vi.fn();
const stream = {
  getTracks: () => [{ stop: trackStop }],
} as unknown as MediaStream;

function installCamera(getUserMedia = vi.fn().mockResolvedValue(stream)) {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia,
      enumerateDevices: vi.fn().mockResolvedValue([]),
    },
  });
  Object.defineProperty(navigator, 'permissions', {
    configurable: true,
    value: { query: vi.fn().mockRejectedValue(new Error('unsupported')) },
  });
  return getUserMedia;
}

function renderCamera(startRequest = 0) {
  const videoRef = { current: null } as React.RefObject<HTMLVideoElement | null>;
  const props = {
    onStream: vi.fn(),
    onError: vi.fn(),
    videoRef,
    mirror: true,
    facing: 'user' as const,
    startRequest,
  };
  return { ...render(<CameraView {...props} />), props };
}

describe('camera permission flow', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    trackStop.mockReset();
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  });

  it('requests camera permission after the parent start request changes', async () => {
    const getUserMedia = installCamera();
    const { rerender, props } = renderCamera(0);

    expect(getUserMedia).not.toHaveBeenCalled();
    rerender(<CameraView {...props} startRequest={1} />);

    await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(1));
    expect(getUserMedia).toHaveBeenCalledWith({
      video: {
        facingMode: 'user',
        width: { ideal: 640 },
        height: { ideal: 400 },
        frameRate: { ideal: 30, max: 30 },
      },
      audio: false,
    });
    await waitFor(() => expect(props.onStream).toHaveBeenCalledWith(stream));
  });

  it('requests camera from a direct user click', async () => {
    const getUserMedia = installCamera();
    renderCamera();

    fireEvent.click(screen.getByRole('button', { name: /enable camera/i }));

    await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(1));
  });
});
