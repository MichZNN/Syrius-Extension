import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import ExplorerLink from '../../components/explorer-link/explorer-link';
import Icon from '../../components/icon/icon';
import { Amount, Status } from '../../components/data/data';
import useBackgroundSender from '../../services/hooks/useBackgroundSender';
import usePagedList from '../../services/hooks/usePagedList';
import useChainChange from '../../services/hooks/useChainChange';
import usePillar from '../../services/hooks/usePillar';
import { reads, templates } from '../../services/pillar/calls';
import {
  canAddPhase,
  canUpdatePhase,
  currentPhase,
  decimals,
  projectLink,
  projectStatus,
  statusLabel,
  votables,
  voteLabel,
  votePasses,
  votes as voteValues,
} from '../../services/pillar/rules';
import { notify } from '../../services/utils/notify';

// The AZ tab (pillar mode): Accelerator-Z.
//
// Projects ask the network's fund for ZNN and QSR, in phases, and pillars vote
// on each. This lists them newest first, shows the tally the contract will
// count, and lets a pillar's owner vote from the row. A vote can be changed
// until the contract counts it, so there is no confirmation in the way: the
// pressed choice shows as sending and the tally follows a momentum later.
//
// A project's owner adds its next phase from here, and anybody can submit a
// project (1 ZNN, kept by the contract).

const statusKind = ['pending', 'success', 'success', 'neutral'];

const filters = [
  { key: 'vote', label: 'To vote' },
  { key: 'all', label: 'All' },
  { key: 'mine', label: 'Mine' },
];

const voteButtons = [
  { vote: voteValues.yes, icon: 'thumbs-up' },
  { vote: voteValues.no, icon: 'thumbs-down' },
  { vote: voteValues.abstain, icon: 'minus' },
];

const Tally = ({ breakdown, pillarCount }) => {
  const yes = Number(breakdown?.yes) || 0;
  const no = Number(breakdown?.no) || 0;
  const total = Number(breakdown?.total) || 0;
  const of = Math.max(Number(pillarCount) || 0, total, 1);
  return (
    <div className="tally">
      {/* Yes and No as shares of all pillars, with the 33% a vote must pass
          marked on the track. */}
      <div className="tally-bar" aria-hidden="true">
        <span className="tally-yes" style={{ width: `${(yes / of) * 100}%` }} />
        <span className="tally-no" style={{ width: `${(no / of) * 100}%` }} />
        <span className="tally-mark" style={{ left: '33%' }} />
      </div>
      <span className="mono">{yes} yes</span>
      <span className="mono">{no} no</span>
      <span className="mono">{total} of {pillarCount || '?'} voted</span>
      {votePasses(breakdown, pillarCount) && <Status kind="success">Passing</Status>}
    </div>
  );
};

// One thing a pillar can vote on: a project, or the open phase of one.
const Votable = ({ item, pillarCount, myVote, sending, canVote, onVote }) => (
  <div className="votable">
    <div className="votable-head">
      <span className="ledger-label">{item.kind === 'phase' ? 'Phase' : 'Project'}</span>
      <span className="votable-funds">
        <Amount value={item.znn} decimals={decimals} symbol="ZNN" maxDecimals={0} />
        <Amount value={item.qsr} decimals={decimals} symbol="QSR" maxDecimals={0} />
      </span>
    </div>
    {item.kind === 'phase' && <div className="votable-name">{item.name}</div>}
    <Tally breakdown={item.votes} pillarCount={pillarCount} />

    {canVote && (
      <div className="vote-row" role="group" aria-label={`Vote on ${item.name}`}>
        {voteButtons.map(({ vote, icon }) => {
          const isMine = myVote === vote;
          const isSending = sending === vote;
          return (
            <button
              key={vote}
              type="button"
              className={`vote-button ${isMine ? 'is-mine' : ''} ${isSending ? 'is-sending' : ''}`}
              aria-pressed={isMine}
              disabled={sending !== undefined}
              onClick={() => onVote(item, vote)}
            >
              <Icon name={isSending ? 'loader' : icon} size={14} className={isSending ? 'spinner' : ''} />
              {voteLabel(vote)}
            </button>
          );
        })}
      </div>
    )}
  </div>
);

const Project = ({ project, address, pillarCount, pillarName, myVotes, sending, onVote, onPhase }) => {
  const open = votables([project]);
  const link = projectLink(project.url);
  const phase = currentPhase(project);

  return (
    <article className="card project">
      <div className="card-head">
        <h2 className="project-name">{project.name}</h2>
        <Status kind={statusKind[project.status] || 'neutral'}>{statusLabel(project.status)}</Status>
        <ExplorerLink href={link} label="Open the proposal" small />
      </div>
      <p className="project-description">{project.description}</p>

      {open.map((item) => (
        <Votable
          key={item.id}
          item={item}
          pillarCount={pillarCount}
          myVote={myVotes[item.id]}
          sending={sending[item.id]}
          canVote={Boolean(pillarName)}
          onVote={onVote}
        />
      ))}

      {!open.length && (
        <div className="votable-head">
          <span className="ledger-label">
            {phase ? `Asked · ${project.phases.length} phase${project.phases.length === 1 ? '' : 's'}` : 'Asked'}
          </span>
          <span className="votable-funds">
            <Amount value={project.znnFundsNeeded} decimals={decimals} symbol="ZNN" maxDecimals={0} />
            <Amount value={project.qsrFundsNeeded} decimals={decimals} symbol="QSR" maxDecimals={0} />
          </span>
        </div>
      )}

      {canAddPhase(project, address) && (
        <button type="button" className="thin-button secondary" onClick={() => onPhase(project, 'add')}>
          Add phase
        </button>
      )}
      {canUpdatePhase(project, address) && (
        <button type="button" className="thin-button secondary" onClick={() => onPhase(project, 'update')}>
          Update phase
        </button>
      )}
    </article>
  );
};

const Az = () => {
  const navigate = useNavigate();
  const { address, pillar } = usePillar();
  const { sendInBackground } = useBackgroundSender();
  const [filter, setFilter] = useState(null);
  const [pillarCount, setPillarCount] = useState(0);
  const [myVotes, setMyVotes] = useState({});
  // id -> the vote in flight, until the node reports it.
  const [sending, setSending] = useState({});

  const fetchPage = useCallback((page, pageSize) => reads.projects(page, pageSize), []);
  const projects = usePagedList(fetchPage, { pageSize: 20 });

  useEffect(() => {
    let cancelled = false;
    reads.pillarCount().then((count) => { if (!cancelled) setPillarCount(count); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const open = useMemo(() => votables(projects.items), [projects.items]);
  const openIds = useMemo(() => open.map((item) => item.id).join(','), [open]);

  // How this pillar has voted on what is open. Read again every momentum while
  // a vote is in flight, which is also what clears the "sending" mark.
  const loadVotes = useCallback(async () => {
    if (!pillar?.name || !openIds) return;
    const ids = openIds.split(',');
    try {
      const list = await reads.pillarVotes(pillar.name, ids);
      const next = {};
      ids.forEach((id, index) => { if (list?.[index]) next[id] = list[index].vote; });
      setMyVotes(next);
      setSending((previous) => {
        const left = Object.entries(previous).filter(([id, vote]) => next[id] !== vote);
        return left.length === Object.keys(previous).length ? previous : Object.fromEntries(left);
      });
    } catch (err) {
      // Reported by the header.
    }
  }, [pillar?.name, openIds]);

  useEffect(() => {
    loadVotes();
    const timer = setInterval(loadVotes, 10000);
    return () => clearInterval(timer);
  }, [loadVotes]);

  // A vote, a project or a phase of this wallet's confirmed: the tallies too.
  useChainChange(() => {
    loadVotes();
    projects.refresh();
  });

  const vote = (item, value) => {
    try {
      sendInBackground(templates.vote(item.id, pillar.name, value), {
        successMessage: `Voted ${voteLabel(value)} on ${item.name}`,
        row: { owner: address, label: `Voting ${voteLabel(value)} on ${item.name}` },
      });
      setSending((previous) => ({ ...previous, [item.id]: value }));
      // A vote the node refused never shows up in the tally. The dashboard
      // row says why; here the buttons come back after a minute.
      setTimeout(() => {
        setSending((previous) => {
          if (previous[item.id] !== value) return previous;
          const { [item.id]: dropped, ...rest } = previous;
          return rest;
        });
      }, 60000);
    } catch (err) {
      notify.error(err);
    }
  };

  // A pillar owner opens on what needs their vote; everyone else on the list.
  const active = filter || (pillar ? 'vote' : 'all');
  const shown = projects.items.filter((project) => {
    if (active === 'mine') return project.owner === address;
    if (active === 'vote') {
      return project.status === projectStatus.voting ||
        (project.status === projectStatus.active && currentPhase(project)?.phase.status === projectStatus.voting);
    }
    return true;
  });

  return (
    <div className="page">
      <div className="segmented is-wide" role="group" aria-label="Show">
        {filters.map((entry) => (
          <button
            key={entry.key}
            type="button"
            className={`segmented-option ${active === entry.key ? 'is-selected' : ''}`}
            aria-pressed={active === entry.key}
            onClick={() => setFilter(entry.key)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {shown.map((project) => (
        <Project
          key={project.id}
          project={project}
          address={address}
          pillarCount={pillarCount}
          pillarName={pillar?.name}
          myVotes={myVotes}
          sending={sending}
          onVote={vote}
          onPhase={(target, mode) => navigate('phase', { state: { project: target, mode } })}
        />
      ))}

      {!shown.length && !projects.hasMore && <p className="empty-note">None yet</p>}
      {projects.error && !shown.length && <p className="empty-note">Could not load</p>}

      <div ref={projects.sentinelRef} className="load-more-sentinel">
        {projects.showLoading && <span className="text-gray">Loading…</span>}
      </div>

      <div className="page-footer">
        <button type="button" className="button primary w-100" onClick={() => navigate('new')}>
          New project
        </button>
      </div>
    </div>
  );
};

export default Az;
