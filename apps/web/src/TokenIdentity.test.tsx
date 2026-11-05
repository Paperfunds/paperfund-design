import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TokenAvatar, ContractAddress } from './TokenIdentity.js';
import { tokenImageCandidates } from './token-image.js';

describe('token images and contract actions', () => {
  it('keeps initials visible during loading, tries the DEX alternative, then removes a failed image', () => {
    const { container } = render(
      <TokenAvatar
        symbol="COIN"
        icon="https://images.example/primary.png"
        fallbackIcon="https://images.example/dex.png"
      />,
    );
    expect(container.querySelector('[data-image-state="loading"]')).not.toBeNull();
    expect(screen.getByText('CO')).toBeInTheDocument();
    fireEvent.error(container.querySelector('img')!);
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://images.example/dex.png');
    fireEvent.load(container.querySelector('img')!);
    expect(container.querySelector('[data-image-state="loaded"]')).not.toBeNull();
    fireEvent.error(container.querySelector('img')!);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('[data-image-state="fallback"]')).not.toBeNull();
    expect(screen.getByText('CO')).toBeInTheDocument();
  });
  it('retries new metadata after a previous image failed and handles missing symbols', () => {
    const { container, rerender } = render(
      <TokenAvatar symbol="😺" icon="https://images.example/old.png" />,
    );
    fireEvent.error(container.querySelector('img')!);
    expect(screen.getByText('PF')).toBeInTheDocument();
    rerender(<TokenAvatar symbol="😺" icon="https://images.example/new.png" />);
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://images.example/new.png');
    expect(container.querySelector('[data-image-state="loading"]')).not.toBeNull();
  });
  it('normalizes IPFS into bounded public alternatives and rejects unsafe image URLs', () => {
    expect(
      tokenImageCandidates('ipfs://ipfs/bafy123/image.png', 'https://images.example/dex.png'),
    ).toEqual([
      'https://ipfs.filebase.io/ipfs/bafy123/image.png',
      'https://ipfs.io/ipfs/bafy123/image.png',
      'https://gateway.pinata.cloud/ipfs/bafy123/image.png',
      'https://images.example/dex.png',
    ]);
    for (const url of [
      'javascript:alert(1)',
      'data:image/svg+xml,bad',
      'https://user:secret@images.example/img',
      'http://images.example/img',
      'https://127.0.0.1/private',
    ])
      expect(tokenImageCandidates(url)).toEqual([]);
    expect(
      tokenImageCandidates('https://images.example/a', 'https://images.example/a'),
    ).toHaveLength(1);
  });
  it('copies the complete mint while showing its compact form', async () => {
    const user = userEvent.setup();
    const copy = vi.spyOn(navigator.clipboard, 'writeText');
    const mint = 'BJVWrJnwMkZ5upJcQqeQ4eShsfuvcEgzxnr6jprBpump';
    render(<ContractAddress mint={mint} compact />);
    expect(screen.getByTitle(mint)).toHaveTextContent('BJVW…pump');
    await user.click(screen.getByRole('button', { name: 'Copy contract ' + mint }));
    expect(copy).toHaveBeenCalledWith(mint);
    expect(screen.getByRole('button')).toHaveAttribute('title', 'Copied');
  });
});
