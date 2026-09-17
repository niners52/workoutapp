import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { colors } from '../../../theme';
import { DEFAULT_HEALTH_TARGETS, type MuscleGroupVolume } from '../../../types';
import {
  CALCIUM_LABEL,
  bodyWeightTile,
  calciumTile,
  loggingTile,
  sodiumTile,
  weeklyVolumeView,
  type NutritionDaySnapshot,
} from '../../../services/healthDashboard';
import { BodyWeightTileView, CalciumTileView, DeloadBanner, LoggingTileView, SodiumTileView, WeeklyVolumeCard } from '..';

// Icons load fonts asynchronously, which only adds act() noise here.
jest.mock('@expo/vector-icons', () => {
  const { View } = require('react-native');
  const Icon = () => require('react').createElement(View);
  return { Ionicons: Icon, MaterialCommunityIcons: Icon };
});

const t = DEFAULT_HEALTH_TARGETS;
/** Local wall-clock time on 2026-09-<day>, independent of the machine's zone. */
const at = (hour: number, minute = 0, day = 14) => new Date(2026, 8, day, hour, minute);

const row = (overrides: Partial<NutritionDaySnapshot>): NutritionDaySnapshot => ({
  date: '2026-09-14',
  sodium_mg: 1000,
  calcium_mg: 1100,
  protein_g: 120,
  sample_count: 12,
  last_sample_at: at(12).toISOString(),
  synced_at: at(12, 5).toISOString(),
  ...overrides,
});

describe('SodiumTileView', () => {
  test('over budget is red and shows the overage, not a remaining figure', () => {
    render(<SodiumTileView state={sodiumTile(row({ sodium_mg: 2750.4 }), t, at(20))} />);
    expect(screen.getByText('Sodium over budget')).toBeTruthy();
    const headline = screen.getByTestId('sodium-headline');
    expect(headline).toHaveTextContent('450 mg over');
    expect(headline).toHaveStyle({ color: colors.error });
    expect(screen.queryByText(/left/)).toBeNull();
  });

  test('copy switches to the evening budget at 17:00 local', () => {
    const r = row({ sodium_mg: 520 });
    const { rerender } = render(<SodiumTileView state={sodiumTile(r, t, at(16, 59))} />);
    expect(screen.getByText('Sodium left today')).toBeTruthy();
    expect(screen.queryByText('Sodium left this evening')).toBeNull();

    rerender(<SodiumTileView state={sodiumTile(r, t, at(17, 0))} />);
    expect(screen.getByText('Sodium left this evening')).toBeTruthy();
    expect(screen.getByTestId('sodium-headline')).toHaveTextContent('1,780 mg left');
  });

  test('no samples reads as nothing logged, never a full budget', () => {
    render(<SodiumTileView state={sodiumTile(null, t, at(9))} />);
    expect(screen.getByTestId('sodium-headline')).toHaveTextContent('Nothing logged yet');
    expect(screen.queryByText(/mg left/)).toBeNull();
  });
});

describe('CalciumTileView', () => {
  test('below the band is amber "low" under a target label', () => {
    render(<CalciumTileView state={calciumTile(row({ calcium_mg: 640 }), null, t)} />);
    expect(screen.getByText(CALCIUM_LABEL)).toBeTruthy();
    const headline = screen.getByTestId('calcium-headline');
    expect(headline).toHaveTextContent('640 mg — low');
    expect(headline).toHaveStyle({ color: colors.warning });
    expect(screen.getByTestId('calcium-marker')).toHaveStyle({ backgroundColor: colors.warning });
  });

  test('in band is green', () => {
    render(<CalciumTileView state={calciumTile(row({ calcium_mg: 1100 }), null, t)} />);
    expect(screen.getByTestId('calcium-headline')).toHaveStyle({ color: colors.healthGood });
  });

  test('an unreadable calcium shows the not-syncing state with a fix link', () => {
    render(<CalciumTileView state={calciumTile(row({ calcium_mg: null }), null, t)} />);
    expect(screen.getByTestId('calcium-headline')).toHaveTextContent('Calcium not syncing');
    expect(screen.getByText('How to fix ›')).toBeTruthy();
    expect(screen.queryByTestId('calcium-marker')).toBeNull();
  });
});

describe('LoggingTileView', () => {
  test('after 19:00 with the last entry before 17:00, nudges that the evening is unlogged', () => {
    const r = row({ last_sample_at: at(15, 30).toISOString(), synced_at: at(19, 30).toISOString() });
    render(<LoggingTileView state={loggingTile(r, t, at(19, 45))} />);
    expect(screen.getByTestId('logging-nudge')).toHaveTextContent('Evening unlogged — sodium invisible');
  });

  test('no nudge before 19:00', () => {
    const r = row({ last_sample_at: at(15, 30).toISOString(), synced_at: at(18, 20).toISOString() });
    render(<LoggingTileView state={loggingTile(r, t, at(18, 30))} />);
    expect(screen.queryByTestId('logging-nudge')).toBeNull();
  });

  test('an evening entry clears the nudge', () => {
    const r = row({ last_sample_at: at(18, 10).toISOString(), synced_at: at(19, 30).toISOString() });
    render(<LoggingTileView state={loggingTile(r, t, at(20))} />);
    expect(screen.queryByTestId('logging-nudge')).toBeNull();
  });

  test('a sync from before 19:00 cannot vouch for the evening', () => {
    const r = row({ last_sample_at: at(15, 30).toISOString(), synced_at: at(16).toISOString() });
    render(<LoggingTileView state={loggingTile(r, t, at(20))} />);
    expect(screen.getByTestId('logging-nudge')).toHaveTextContent('Evening not synced — pull to refresh');
  });
});

describe('BodyWeightTileView', () => {
  // Framing follows the explicit mode now, not proximity to the 175 lb goal line.
  test('maintenance mode says maintenance, at the goal line or above it', () => {
    const now = at(9);
    const atGoal = [
      { date: '2026-09-14', weight: 175.6 },
      { date: '2026-09-12', weight: 174.8 },
    ];
    const { rerender } = render(<BodyWeightTileView state={bodyWeightTile(atGoal, t, now)} />);
    expect(screen.getByTestId('weight-detail')).toHaveTextContent('At goal — maintenance mode');
    expect(screen.getByTestId('weight-calorie-copy')).toHaveTextContent('Eat at maintenance calories');

    const aboveGoal = [
      { date: '2026-09-14', weight: 187.4 },
      { date: '2026-09-12', weight: 187.0 },
    ];
    rerender(<BodyWeightTileView state={bodyWeightTile(aboveGoal, t, now)} />);
    expect(screen.getByTestId('weight-detail')).toHaveTextContent('12.2 lb above 175 lb goal — maintenance mode');
    expect(screen.getByTestId('weight-calorie-copy')).toHaveTextContent('Eat at maintenance calories');
  });

  test('cutting mode frames the same average as a deficit', () => {
    const aboveGoal = [
      { date: '2026-09-14', weight: 187.4 },
      { date: '2026-09-12', weight: 187.0 },
    ];
    render(<BodyWeightTileView state={bodyWeightTile(aboveGoal, { ...t, macroMode: 'cutting' }, at(9))} />);
    expect(screen.getByTestId('weight-detail')).toHaveTextContent('12.2 lb above 175 lb goal');
    expect(screen.getByTestId('weight-calorie-copy')).toHaveTextContent('Calorie deficit toward goal');
  });

  test('a weigh-in older than 2 days asks for the scale instead of a stale number', () => {
    render(<BodyWeightTileView state={bodyWeightTile([{ date: '2026-09-10', weight: 186.9 }], t, at(9))} />);
    expect(screen.getByTestId('weight-detail')).toHaveTextContent('Step on the scale');
    expect(screen.queryByText(/186/)).toBeNull();
  });
});

describe('WeeklyVolumeCard', () => {
  const vol = (muscleGroup: string, sets: number, target: number) =>
    ({ muscleGroup, sets, target, exercises: [] }) as unknown as MuscleGroupVolume;
  const week = [vol('quads', 0, 12), vol('triceps', 1, 12), vol('biceps', 12, 12)];
  const friday = at(12, 0, 18);
  const card = (targets = t) => {
    const view = weeklyVolumeView(week, targets, friday, 'monday');
    return (
      <>
        {view.deload && <DeloadBanner />}
        <WeeklyVolumeCard view={view} onRowPress={() => {}} onOpenAnalytics={() => {}} />
      </>
    );
  };

  test('outside the deload week, a late-week gap is urgent', () => {
    render(card());
    expect(screen.queryByTestId('deload-banner')).toBeNull();
    expect(screen.getByTestId('volume-gap-quads')).toHaveStyle({ color: colors.error });
  });

  test('in the deload week, the banner shows and urgency colors are suppressed', () => {
    render(card({ ...t, deloadWeekStart: '2026-09-14' }));
    expect(screen.getByText('Deload week — targets suspended')).toBeTruthy();
    for (const id of ['volume-gap-quads', 'volume-gap-triceps']) {
      const gap = screen.getByTestId(id);
      expect(gap).toHaveStyle({ color: colors.text });
      expect(gap).not.toHaveStyle({ color: colors.error });
      expect(gap).not.toHaveStyle({ color: colors.warning });
    }
    // Still sorted by gap, and met groups still collapse.
    expect(screen.getByTestId('volume-met-summary')).toHaveTextContent('1 group at or over target ›');
  });
});
