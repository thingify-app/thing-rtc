import { Thing } from "../src";
import { expect } from 'chai';
import 'mocha';

describe('thing', function() {
  it('does thing', function() {
    const thing = new Thing();
    expect(thing.doThing()).equal('hello');
  });
});
