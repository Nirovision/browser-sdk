import type { RelativeTime } from '@datadog/browser-core'
import {
  ExperimentalFeature,
  resetExperimentalFeatures,
  addExperimentalFeatures,
  relativeToClocks,
} from '@datadog/browser-core'
import type { TestSetupBuilder } from '../../../test'
import { setup } from '../../../test'
import { LifeCycleEventType } from '../lifeCycle'
import type { ViewCreatedEvent, ViewEndedEvent } from '../rumEventsCollection/view/trackViews'
import type { FeatureFlagContexts } from './featureFlagContext'
import { startFeatureFlagContexts } from './featureFlagContext'

describe('featureFlagContexts', () => {
  let setupBuilder: TestSetupBuilder
  let featureFlagContexts: FeatureFlagContexts
  let computeBytesCountStub: jasmine.Spy

  beforeEach(() => {
    setupBuilder = setup().beforeBuild(({ lifeCycle }) => {
      computeBytesCountStub = jasmine.createSpy('computeBytesCountStub').and.returnValue(1)
      featureFlagContexts = startFeatureFlagContexts(lifeCycle, computeBytesCountStub)
    })
  })

  afterEach(() => {
    resetExperimentalFeatures()
    setupBuilder.cleanup()
  })

  it('should return undefined before the initial view', () => {
    setupBuilder.build()

    expect(featureFlagContexts.findFeatureFlagEvaluations()).toBeUndefined()
  })

  describe('addFeatureFlagEvaluation', () => {
    it('should add feature flag evaluations of any type when the ff feature_flags is enabled', () => {
      addExperimentalFeatures([ExperimentalFeature.FEATURE_FLAGS])

      const { lifeCycle } = setupBuilder.build()

      lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, {
        startClocks: relativeToClocks(0 as RelativeTime),
      } as ViewCreatedEvent)

      featureFlagContexts.addFeatureFlagEvaluation('feature', 'foo')
      featureFlagContexts.addFeatureFlagEvaluation('feature2', 2)
      featureFlagContexts.addFeatureFlagEvaluation('feature3', true)
      featureFlagContexts.addFeatureFlagEvaluation('feature4', { foo: 'bar' })

      const featureFlagContext = featureFlagContexts.findFeatureFlagEvaluations()!

      expect(featureFlagContext).toEqual({
        feature: 'foo',
        feature2: 2,
        feature3: true,
        feature4: { foo: 'bar' },
      })
    })

    it('should replace existing feature flag evaluation to the current context when the ff feature_flags is enabled', () => {
      addExperimentalFeatures([ExperimentalFeature.FEATURE_FLAGS])

      const { lifeCycle } = setupBuilder.build()

      lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, {
        startClocks: relativeToClocks(0 as RelativeTime),
      } as ViewCreatedEvent)

      featureFlagContexts.addFeatureFlagEvaluation('feature', 'foo')
      featureFlagContexts.addFeatureFlagEvaluation('feature2', 'baz')
      featureFlagContexts.addFeatureFlagEvaluation('feature', 'bar')

      const featureFlagContext = featureFlagContexts.findFeatureFlagEvaluations()!

      expect(featureFlagContext).toEqual({ feature: 'bar', feature2: 'baz' })
    })

    it('should not add feature flag evaluation when the ff feature_flags is disabled', () => {
      const { lifeCycle } = setupBuilder.build()

      lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, {
        startClocks: relativeToClocks(0 as RelativeTime),
      } as ViewCreatedEvent)

      featureFlagContexts.addFeatureFlagEvaluation('feature', 'foo')

      const featureFlagContext = featureFlagContexts.findFeatureFlagEvaluations()!

      expect(featureFlagContext).toBeUndefined()
    })
  })

  describe('findFeatureFlagEvaluations', () => {
    /**
     * It could happen if there is an event happening just between view end and view creation
     * (which seems unlikely) and this event would anyway be rejected by lack of view id
     */
    it('should return undefined when no current view', () => {
      addExperimentalFeatures([ExperimentalFeature.FEATURE_FLAGS])

      setupBuilder.build()

      expect(featureFlagContexts.findFeatureFlagEvaluations()).toBeUndefined()
    })

    it('should clear feature flag context on new view', () => {
      addExperimentalFeatures([ExperimentalFeature.FEATURE_FLAGS])

      const { lifeCycle } = setupBuilder.build()

      lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, {
        startClocks: relativeToClocks(0 as RelativeTime),
      } as ViewCreatedEvent)
      featureFlagContexts.addFeatureFlagEvaluation('feature', 'foo')
      lifeCycle.notify(LifeCycleEventType.VIEW_ENDED, {
        endClocks: relativeToClocks(10 as RelativeTime),
      } as ViewEndedEvent)
      lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, {
        startClocks: relativeToClocks(10 as RelativeTime),
      } as ViewCreatedEvent)

      const featureFlagContext = featureFlagContexts.findFeatureFlagEvaluations()!
      expect(featureFlagContext).toEqual({})
    })

    it('should return the feature flag context corresponding to the start time', () => {
      addExperimentalFeatures([ExperimentalFeature.FEATURE_FLAGS])

      const { lifeCycle, clock } = setupBuilder.withFakeClock().build()

      lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, {
        startClocks: relativeToClocks(0 as RelativeTime),
      } as ViewCreatedEvent)

      clock.tick(10)
      featureFlagContexts.addFeatureFlagEvaluation('feature', 'one')
      lifeCycle.notify(LifeCycleEventType.VIEW_ENDED, {
        endClocks: relativeToClocks(10 as RelativeTime),
      } as ViewEndedEvent)
      lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, {
        startClocks: relativeToClocks(10 as RelativeTime),
      } as ViewCreatedEvent)

      clock.tick(10)
      featureFlagContexts.addFeatureFlagEvaluation('feature', 'two')

      expect(featureFlagContexts.findFeatureFlagEvaluations(5 as RelativeTime)).toEqual({ feature: 'one' })
      expect(featureFlagContexts.findFeatureFlagEvaluations(15 as RelativeTime)).toEqual({ feature: 'two' })
    })
  })

  describe('getFeatureFlagBytesCount', () => {
    it('should compute the bytes count only if the context has been updated', () => {
      addExperimentalFeatures([ExperimentalFeature.FEATURE_FLAGS])
      const { lifeCycle } = setupBuilder.withFakeClock().build()

      lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, {
        startClocks: relativeToClocks(0 as RelativeTime),
      } as ViewCreatedEvent)
      featureFlagContexts.addFeatureFlagEvaluation('feature1', 'foo')
      featureFlagContexts.getFeatureFlagBytesCount()
      featureFlagContexts.addFeatureFlagEvaluation('feature2', 'bar')
      featureFlagContexts.getFeatureFlagBytesCount()

      // feature flags are cleared when a view is created
      lifeCycle.notify(LifeCycleEventType.VIEW_CREATED, {
        startClocks: relativeToClocks(10 as RelativeTime),
      } as ViewCreatedEvent)
      featureFlagContexts.getFeatureFlagBytesCount()
      const bytesCount = featureFlagContexts.getFeatureFlagBytesCount()

      expect(bytesCount).toEqual(1)
      expect(computeBytesCountStub).toHaveBeenCalledTimes(3)
    })
  })
})
