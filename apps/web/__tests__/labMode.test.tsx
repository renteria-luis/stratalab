import { associateRouteTable, replaceSecurityGroupRules } from '@sim/engine';
import { lab01 } from '@sim/labs';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { en } from '../src/i18n/messages/en';
import { labStore } from '../src/state/labStore';
import { activeTopology, topologyStore } from '../src/state/topologyStore';
import { uiStore } from '../src/state/uiStore';
import { renderApp } from './renderApp';

function startLab1() {
  return renderApp('/labs');
}

describe('lab mode', () => {
  it('LAB: starting lab 1 opens its own workspace, the panel and the browser; the sandbox stays', async () => {
    const { router } = startLab1();
    fireEvent.click(await screen.findByRole('button', { name: en['labs.start'] }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/');
    });
    expect(topologyStore.getState().activeWorkspaceId).toBe('lab-01');
    expect(activeTopology(topologyStore.getState())).toEqual(lab01.initialTopology);
    expect(topologyStore.getState().workspaces.sandbox).toBeDefined();
    expect(await screen.findByText(lab01.story.en)).toBeDefined();
    expect(uiStore.getState()).toMatchObject({ workbenchOpen: true, workbenchTab: 'browser' });
  });

  it('LAB: Check reports goals without causes; Hint is opt-in and counted', async () => {
    startLab1();
    fireEvent.click(await screen.findByRole('button', { name: en['labs.start'] }));
    fireEvent.click(await screen.findByRole('button', { name: en['lab.check'] }));
    expect(await screen.findAllByText(en['lab.notYet'])).toHaveLength(1);
    expect(screen.queryByText(/ENI_SG_RULES_MISMATCH|security group/i)).toBeNull();
    expect(screen.queryByText(lab01.hints[0]?.en ?? '')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: en['lab.hint'] }));
    expect(await screen.findByText(lab01.hints[0]?.en ?? '')).toBeDefined();
    expect(labStore.getState().progress['lab-01']?.hintsUsed).toBe(1);
  });

  it('BROWSER: the page loads only after both fixes, inside a sandboxed iframe without scripts', async () => {
    startLab1();
    fireEvent.click(await screen.findByRole('button', { name: en['labs.start'] }));
    fireEvent.click(await screen.findByRole('button', { name: en['browser.go'] }));
    expect(await screen.findByText(en['browser.cantReach'])).toBeDefined();

    act(() => {
      topologyStore.getState().apply((t) =>
        replaceSecurityGroupRules(t, 'sg-0000000a', 'inbound', [
          {
            protocol: 'tcp',
            fromPort: 80,
            toPort: 80,
            peer: { type: 'cidr', cidrBlock: '0.0.0.0/0' },
          },
        ]),
      );
      topologyStore
        .getState()
        .apply((t) => associateRouteTable(t, 'subnet-0000000a', 'rtb-00000002'));
    });
    fireEvent.click(screen.getByRole('button', { name: en['browser.go'] }));
    const frame = await screen.findByTitle(/Page served by web-1/);
    expect(frame.getAttribute('sandbox')).toBe('');
    expect(frame.getAttribute('srcdoc')).toContain('It works');

    fireEvent.click(screen.getByRole('button', { name: en['lab.check'] }));
    expect(await screen.findByText(en['lab.complete'])).toBeDefined();
    expect(screen.getByText(en['lab.review'])).toBeDefined();
    expect(screen.getByText(en['lab.hintsUsed'])).toBeDefined();
    expect(labStore.getState().progress['lab-01']?.status).toBe('completed');
  });

  it('LAB: leaving the lab returns to the sandbox topology', async () => {
    startLab1();
    fireEvent.click(await screen.findByRole('button', { name: en['labs.start'] }));
    fireEvent.click(await screen.findByRole('button', { name: en['lab.leave'] }));
    await waitFor(() => {
      expect(topologyStore.getState().activeWorkspaceId).toBe('sandbox');
    });
    expect(labStore.getState().activeLabId).toBeNull();
  });
});
