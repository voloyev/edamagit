import { Uri, workspace, window } from 'vscode';
import { MagitRepository } from '../models/magitRepository';
import { gitRun } from '../utils/gitRawRunner';
import { views } from '../extension';
import { DiffView } from '../views/diffView';
import { MenuUtil, MenuState } from '../menu/menu';
import { PickMenuUtil, PickMenuItem } from '../menu/pickMenu';
import { Stash } from '../common/gitApiExtensions';
import { StashDetailView } from '../views/stashDetailView';
import MagitUtils from '../utils/magitUtils';
import SectionDiffView from '../views/sectionDiffView';
import { visitCommit } from './visitAtPointCommands';
import { Section } from '../views/general/sectionHeader';
import { Change, Status } from '../typings/git';
import { LineSplitterRegex } from '../common/constants';
import { MagitChange } from '../models/magitChange';

const diffingMenu = {
  title: 'Diffing',
  commands: [
    { label: 'r', description: 'Diff range', action: diffRange },
    { label: 'p', description: 'Diff paths', action: diffPaths },
    { label: 'u', description: 'Diff unstaged', action: diffUnstaged },
    { label: 's', description: 'Diff staged', action: diffStaged },
    { label: 'w', description: 'Diff worktree', action: diffWorktree },
    { label: 'c', description: 'Show commit', action: showCommit },
    { label: 't', description: 'Show stash', action: showStash },
  ]
};

export async function diffing(repository: MagitRepository) {

  // const switches = [
  // { key: '-f', name: '--function-context', description: 'Show surrounding functions' },
  // { key: '-b', name: '--ignore-space-change', description: 'Ignore whitespace changes' },
  // { key: '-w', name: '--ignore-all-space', description: 'Ignore all whitespace' },
  // { key: '-x', name: '--no-ext-diff', description: 'Disallow external diff drivers', activated: true },
  // { key: '-s', name: '--stat', description: 'Show stats', activated: true },
  // ];

  return MenuUtil.showMenu(diffingMenu, { repository });
}

async function diffRange({ repository }: MenuState) {

  let range = await window.showInputBox({ prompt: `Diff for range (${repository.magitState?.HEAD?.name})` });

  if (!range) {
    range = repository.magitState?.HEAD?.name;
  }

  if (range) {
    const args = [range];
    return diff(repository, range, args);
  }
}

async function diffPaths({ repository }: MenuState) {
  const fileA = await window.showInputBox({ prompt: 'First file', value: repository.rootUri.fsPath });

  if (fileA) {

    const fileB = await window.showInputBox({ prompt: 'Second file', value: repository.rootUri.fsPath });

    if (fileB) {
      return diff(repository, 'files', ['--no-index', fileA, fileB]);
    }
  }
}

async function diffStaged({ repository }: MenuState) {
  return showDiffSection(repository, Section.Staged);
}

async function diffUnstaged({ repository }: MenuState) {
  return showDiffSection(repository, Section.Unstaged);
}
async function diffWorktree({ repository }: MenuState) {
  return diff(repository, 'worktree', ['HEAD']);
}

async function diff(repository: MagitRepository, id: string, args: string[] = []) {
  const diffResult = await gitRun(repository, ['diff', ...args]);

  const uri = DiffView.encodeLocation(repository, id);
  views.set(uri.toString(), new DiffView(uri, diffResult.stdout));
  return workspace.openTextDocument(uri).then(doc => window.showTextDocument(doc, { viewColumn: MagitUtils.showDocumentColumn(), preview: false }));
}

export async function showDiffSection(repository: MagitRepository, section: Section, preserveFocus = false) {
  const uri = SectionDiffView.encodeLocation(repository);
  views.set(uri.toString(), new SectionDiffView(uri, repository.magitState!, section));
  return workspace.openTextDocument(uri)
    .then(doc => window.showTextDocument(doc, { viewColumn: MagitUtils.showDocumentColumn(), preserveFocus, preview: false }));
}

async function showStash({ repository }: MenuState) {

  const stashesPicker: PickMenuItem<Stash>[] = repository.magitState?.stashes.map(stash => ({ label: `stash@{${stash.index}}`, meta: stash })) ?? [];

  const chosenStash = await PickMenuUtil.showMenu(stashesPicker);

  if (chosenStash) {
    return showStashDetail(repository, chosenStash);
  }
}

export async function showStashDetail(repository: MagitRepository, stash: Stash) {
  const uri = StashDetailView.encodeLocation(repository, stash);

  const stashShowTask = gitRun(repository, ['stash', 'show', '-p', `stash@{${stash.index}}`]);
  let stashUntrackedFiles: MagitChange[] = [];
  try {
    let untracked = await gitRun(repository, ['ls-tree', '-r', 'stash@{0}^3', '--name-only']);

    let untrackedList = untracked.stdout.split(LineSplitterRegex);
    untrackedList = untrackedList.slice(0, untrackedList.length - 1);

    stashUntrackedFiles = untrackedList.map(fileName => ({
      uri: Uri.parse(fileName),
      originalUri: Uri.parse(fileName),
      relativePath: fileName,
      renameUri: undefined,
      status: Status.UNTRACKED,
      section: Section.Untracked
    }));

  } catch { }

  const stashDiff = (await stashShowTask).stdout;

  views.set(uri.toString(), new StashDetailView(uri, stash, stashDiff, stashUntrackedFiles));
  return workspace.openTextDocument(uri).then(doc => window.showTextDocument(doc, { viewColumn: MagitUtils.showDocumentColumn(), preview: false }));
}

async function showCommit({ repository }: MenuState) {

  const ref = await MagitUtils.chooseRef(repository, 'Show commit', true, true);

  if (ref) {
    return visitCommit(repository, ref);
  }
}

export async function diffFile(repository: MagitRepository, fileUri: Uri, index = false) {

  const args = ['diff'];

  if (index) {
    args.push('--cached');
  }

  args.push(fileUri.fsPath);

  const diffResult = await gitRun(repository, args);

  const uri = DiffView.encodeLocation(repository, fileUri.path);
  views.set(uri.toString(), new DiffView(uri, diffResult.stdout));
  return workspace.openTextDocument(uri).then(doc => window.showTextDocument(doc, { preview: false }));
}
