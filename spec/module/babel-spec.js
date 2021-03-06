// localLookupStub returns the text of what the path it will be looking up
// Doesn't really return the actual result from the service
// This is fair enough from a unit test point of view
// If this is too brittle, we can convert it into a proper integration test.
const { getProjectPathStub, fixturesBasePath: base, async, localLookupStub } = require('../spec-helper');
const { extractPrefixFrom } = require('../../lib/utils/path-helpers');

// This module is pretty crucial to how babelmodule operates
// Use the fixtures folder as your test dummy
const lookupAlias = require('../../lib/utils/lookup-alias');

describe('module lookup: babel',() => {
  let subject;
  let findBabelConfigMock = jasmine.createSpy('findBabelConfig');

  beforeEach(() => {
    subject = new (require('../../lib/lookups/module/babel'))
      (getProjectPathStub, extractPrefixFrom, require('path'),
      findBabelConfigMock, localLookupStub, lookupAlias);
  });

  describe('no config', () => {
    it('should not lookup anything', async((done) => {
      findBabelConfigMock.andReturn(Promise.resolve(null));
      subject.getList('someprefix', '/some/path')
      .then(result => {
        done(() => {
          expect(result.length).toBe(0);});
      });
    }));

    it('should not lookup anything when no file', async((done) => {
      findBabelConfigMock.andReturn(Promise.resolve({ file: null }));
      subject.getList('someprefix', '/some/path')
      .then(result => {
        done(() => {
          expect(result.length).toBe(0);});
      });
    }));
  });

  describe('massage prefix', () => {
    it('should remove parent directory', () => {
      const result = subject.massagePrefix('inny/function');
      expect(result).toBe('function');
    });

    it('should remove all directories', () => {
      const result = subject.massagePrefix('inny/');
      expect(result).toBe('');
    });
  });

  describe('nested babelrc', () => {
    describe('with different config files', () => {
      beforeEach(() => {
        let nestedMock = function(path) {
          switch (path) {
            case `${base}/subfolder/innerFolder`:
            return { config: {
              'plugins': [
                ['module-alias', [
                  { 'src': './', 'expose': 'inny' }
                ]]
              ]}, file: `${base}/subfolder/innerFolder/.babelrc`}
            default:
            return { config: {
              'plugins': [
                ["module-resolver", {
                  "alias": {
                    "nonexist": "./src/fake",
                    "inny": "./other_modules/something" }
                  }]
                ]},
                file: `${base}/.babelrc`
              };
            }
          };
          subject = new (require('../../lib/lookups/module/babel'))
          (getProjectPathStub, extractPrefixFrom, require('path'),
          nestedMock, localLookupStub, lookupAlias);
        });

        it('should return 2 suggestions', async((done) => {
          subject.getList('inny/function', `${base}/subfolder/innerFolder/testbed.js`)
          .then((results) => {
            done(() => {
              expect(results.length).toBe(2);
              expect(results.some(result =>
                result.text === `${base}/other_modules/something`)).toBe(true);
              expect(results.some(result =>
                result.text === `${base}/subfolder/innerFolder`)).toBe(true);
            });
          }).catch(e => { throw new Error(e); });
        }));
    });
  });

  describe('v1 - babel-plugin-module-alias', () => {
    beforeEach(() => {
      findBabelConfigMock.andReturn(Promise.resolve({ config: {
        'plugins': [
          ['module-alias', [
            { 'src': './subfolder/innerFolder', 'expose': 'inny' },
            { 'src': './src/fake', 'expose': 'notexist' }
          ]]
        ]}, file: `${base}/.babelrc`}));
    });

    it('should return aliased suggestions', async((done) => {
      subject.getList('inny/function', `${base}/subfolder/namedFunction.js`)
      .then((results) => {
        done(() => {
          expect(results.length).toBe(1);
          expect(results[0].text).toBe(`${base}/subfolder/innerFolder`);
        });
      }).catch(e => { throw new Error(e); });
    }));
  });

  describe('v2 - babel-plugin-module-resolver', () => {
    let v2Config;

    beforeEach(() => {
      v2Config = { config: {
          'plugins': [
            ["module-resolver", {
              "alias": {
                "nonexist": "./src/fake",
                "inny": "./subfolder/innerFolder" }
              }]
          ]},
          file: `${base}/.babelrc`
        };
      findBabelConfigMock.andReturn(Promise.resolve(v2Config));
    });

    it('should return aliased suggestions', async((done) => {
      subject.getList('inny/function', `${base}/testbed.js`)
      .then((results) => {
        done(() => {
          expect(results.length).toBe(1);
          expect(results[0].text).toBe(`${base}/subfolder/innerFolder`);
        });
      }).catch(e => { throw new Error(e); });
    }));

    describe('No alias found (invalid config)', () => {
      beforeEach(() => {
        spyOn(localLookupStub, 'lookup').andReturn(Promise.resolve(false));
      });

      it('should return no results', async((done) => {
        subject.getList('inny/function', `${base}/testbed.js`)
        .then(result => {
          done(() => {
            expect(result.length).toBe(0);
          });
        });
      }));
    });

    describe('with custom root directories', () => {
        beforeEach(() => {
          v2Config = { config: {
              'plugins': [
                ["module-resolver", {
                  "root": ["./subfolder"],
                  "alias": {
                    "wrong": "./other_modules/something",
                    "inny": "./subfolder/innerFolder" }
                }]
              ]},
              file: `${base}/.babelrc`
            };
          findBabelConfigMock.andReturn(Promise.resolve(v2Config));
        });

        it('should return aliased suggestions and root suggestions', async((done) => {
          subject.getList('inny/function', `${base}/testbed.js`)
          .then((results) => {
            done(() => {
              expect(results.length).toBe(2);
            });
          }).catch(e => { throw new Error(e); });
        }));

        it('should return root suggestions', async(done => {
          subject
          .getList('namedFunction', `${base}/testbed.js`)
          .then(results => {
            done(() => {
                expect(results).toHaveLength(1);
                expect(results[0].text).toBe(`${base}/subfolder`);
            });
          })
          .catch(e => {
            throw new Error(e);
          });
      }));

        describe('root as .', () => {
          beforeEach(() => {
            v2Config.config.plugins = [
                  ["module-resolver", {
                    "root": ["./subfolder"]
                  }]
                ];
            spyOn(localLookupStub, 'lookup').andCallThrough();
            findBabelConfigMock.andReturn(Promise.resolve(v2Config));
          });

          it('should lookup prefix from defined root base', async(done => {
            subject
            .getList('innerFolder/a', `${base}/subfolder/namedFunction.js`)
            .then(() => {
              done(() => {
                expect(localLookupStub.lookup).toHaveBeenCalledWith(
                  './innerFolder/a',
                  `${base}/subfolder`
                )
              });
            })
            .catch(e => {
              throw new Error(e);
            });
          }));
        });
    });
  });
});
