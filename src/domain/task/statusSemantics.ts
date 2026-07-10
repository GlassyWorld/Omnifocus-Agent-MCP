import { RawTask, StatusSource } from './taskTypes.js';

export type CompletionSemantics = {
  direct: boolean;
  directDate: string | null;
  effectiveDate: string | null;
  source: StatusSource;
};

export type DropSemantics = {
  direct: boolean;
  directDate: string | null;
  effectiveDate: string | null;
  source: StatusSource;
};

export type FlagSemantics = {
  direct: boolean;
  effective: boolean;
  source: StatusSource;
};

export type FlagFacts = Pick<RawTask, 'flagged' | 'effectiveFlagged'>;

export function classifyCompletion(raw: RawTask): CompletionSemantics {
  if (raw.completed || raw.completionDate) {
    return {
      direct: true,
      directDate: raw.completionDate,
      effectiveDate: raw.effectiveCompletedDate,
      source: "direct",
    };
  }

  if (raw.effectiveCompletedDate) {
    return {
      direct: false,
      directDate: null,
      effectiveDate: raw.effectiveCompletedDate,
      source: "inherited",
    };
  }

  return {
    direct: false,
    directDate: null,
    effectiveDate: null,
    source: "none",
  };
}

export function classifyDrop(raw: RawTask): DropSemantics {
  if (raw.dropDate) {
    return {
      direct: true,
      directDate: raw.dropDate,
      effectiveDate: raw.effectiveDropDate,
      source: "direct",
    };
  }

  if (raw.effectiveDropDate) {
    return {
      direct: false,
      directDate: null,
      effectiveDate: raw.effectiveDropDate,
      source: "inherited",
    };
  }

  return {
    direct: false,
    directDate: null,
    effectiveDate: null,
    source: "none",
  };
}

export function classifyFlag(raw: FlagFacts): FlagSemantics {
  if (raw.flagged) {
    return {
      direct: true,
      effective: true,
      source: "direct",
    };
  }

  if (raw.effectiveFlagged) {
    return {
      direct: false,
      effective: true,
      source: "inherited",
    };
  }

  return {
    direct: false,
    effective: false,
    source: "none",
  };
}
