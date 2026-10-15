import { describe, expect, it } from 'vitest';

import { Membership } from './membership';

const owner = new Membership('m-owner', 'user-owner', 'owner');
const member = new Membership('m-member', 'user-member', 'member');
const validation = expect.objectContaining({ code: 'VALIDATION_ERROR' });

describe('Membership.assertCanChangeRole', () => {
  it('forbids demoting the last owner', () => {
    expect(() => owner.assertCanChangeRole('member', 1)).toThrow(validation);
  });

  it('allows demoting an owner when another owner exists', () => {
    expect(() => owner.assertCanChangeRole('member', 2)).not.toThrow();
  });

  it('allows promoting a member', () => {
    expect(() => member.assertCanChangeRole('owner', 1)).not.toThrow();
  });

  it('rejects unchanged role', () => {
    expect(() => member.assertCanChangeRole('member', 1)).toThrow(validation);
  });
});

describe('Membership.assertCanBeRemovedBy', () => {
  it('forbids removing yourself', () => {
    expect(() => member.assertCanBeRemovedBy('user-member', 1)).toThrow(validation);
  });

  it('forbids removing the last owner', () => {
    expect(() => owner.assertCanBeRemovedBy('someone-else', 1)).toThrow(validation);
  });

  it('allows removing a member or a non-last owner', () => {
    expect(() => member.assertCanBeRemovedBy('user-owner', 1)).not.toThrow();
    expect(() => owner.assertCanBeRemovedBy('another-owner', 2)).not.toThrow();
  });
});

describe('Membership.assertCanLeave', () => {
  it('forbids the last owner to leave', () => {
    expect(() => owner.assertCanLeave(1)).toThrow(validation);
  });

  it('allows a member or a non-last owner to leave', () => {
    expect(() => member.assertCanLeave(1)).not.toThrow();
    expect(() => owner.assertCanLeave(2)).not.toThrow();
  });
});
