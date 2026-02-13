import { describe, it, expect } from 'vitest';
import { analyzeTaskComplexity, getComplexityReason } from '../../../src/agent/task-analyzer.js';

describe('Task Analyzer', () => {
  describe('analyzeTaskComplexity', () => {
    describe('Simple tasks', () => {
      it('should classify typo fixes as simple', () => {
        expect(analyzeTaskComplexity('Fix typo in README')).toBe('simple');
        expect(analyzeTaskComplexity('Correct typo in documentation')).toBe('simple');
      });

      it('should classify documentation updates as simple', () => {
        expect(analyzeTaskComplexity('Update comment in code')).toBe('simple');
        expect(analyzeTaskComplexity('Add comment to function')).toBe('simple');
        expect(analyzeTaskComplexity('Update README with new instructions')).toBe('simple');
      });

      it('should classify formatting as simple', () => {
        expect(analyzeTaskComplexity('Format code with prettier')).toBe('simple');
        expect(analyzeTaskComplexity('Run lint on files')).toBe('simple');
      });

      it('should classify simple file operations as simple', () => {
        expect(analyzeTaskComplexity('Rename file from old to new')).toBe('simple');
        expect(analyzeTaskComplexity('Delete unused imports')).toBe('simple');
        expect(analyzeTaskComplexity('Remove unused code')).toBe('simple');
      });

      it('should classify version updates as simple', () => {
        expect(analyzeTaskComplexity('Update version to 1.2.3')).toBe('simple');
        expect(analyzeTaskComplexity('Bump version number')).toBe('simple');
      });
    });

    describe('Complex tasks', () => {
      it('should classify new features as complex', () => {
        expect(analyzeTaskComplexity('Implement user authentication')).toBe('complex');
        expect(analyzeTaskComplexity('Add feature for file upload')).toBe('complex');
        expect(analyzeTaskComplexity('Create new dashboard component')).toBe('complex');
      });

      it('should classify refactoring as complex', () => {
        expect(analyzeTaskComplexity('Refactor authentication service')).toBe('complex');
        expect(analyzeTaskComplexity('Redesign database schema')).toBe('complex');
        expect(analyzeTaskComplexity('Rewrite API layer')).toBe('complex');
      });

      it('should classify bug fixes as complex', () => {
        expect(analyzeTaskComplexity('Fix bug in payment processing')).toBe('complex');
        expect(analyzeTaskComplexity('Debug memory leak issue')).toBe('complex');
        expect(analyzeTaskComplexity('Investigate slow query performance')).toBe('complex');
      });

      it('should classify optimization as complex', () => {
        expect(analyzeTaskComplexity('Optimize database queries')).toBe('complex');
        expect(analyzeTaskComplexity('Improve performance of API')).toBe('complex');
        expect(analyzeTaskComplexity('Enhance user experience')).toBe('complex');
      });

      it('should classify integration tasks as complex', () => {
        expect(analyzeTaskComplexity('Integrate with payment gateway')).toBe('complex');
        expect(analyzeTaskComplexity('Connect to external API')).toBe('complex');
        expect(analyzeTaskComplexity('Migrate to new database')).toBe('complex');
      });

      it('should classify testing as complex', () => {
        expect(analyzeTaskComplexity('Add tests for authentication')).toBe('complex');
        expect(analyzeTaskComplexity('Validate input data')).toBe('complex');
        expect(analyzeTaskComplexity('Ensure security compliance')).toBe('complex');
      });

      it('should classify multi-step tasks as complex', () => {
        // Note: "Update docs" contains simple indicator, so prioritized as simple
        // Using different example that doesn't have simple indicators
        expect(analyzeTaskComplexity('Implement feature and add tests')).toBe('complex');
        expect(analyzeTaskComplexity('Refactor code then optimize performance')).toBe('complex');
      });

      it('should classify security tasks as complex', () => {
        expect(analyzeTaskComplexity('Add authentication to API')).toBe('complex');
        expect(analyzeTaskComplexity('Implement authorization rules')).toBe('complex');
        expect(analyzeTaskComplexity('Fix security vulnerability')).toBe('complex');
      });
    });

    describe('Default behavior', () => {
      it('should default to complex for ambiguous tasks', () => {
        expect(analyzeTaskComplexity('Do something with the code')).toBe('complex');
        expect(analyzeTaskComplexity('Make changes to the app')).toBe('complex');
      });

      it('should default to complex for unknown patterns', () => {
        expect(analyzeTaskComplexity('Frobulate the quantum flux capacitor')).toBe('complex');
      });
    });
  });

  describe('getComplexityReason', () => {
    it('should provide reason for simple tasks', () => {
      const reason = getComplexityReason('Fix typo in code', 'simple');
      expect(reason).toContain('simple');
      expect(reason.toLowerCase()).toContain('typo');
    });

    it('should provide reason for complex tasks', () => {
      const reason = getComplexityReason('Implement new feature', 'complex');
      expect(reason).toContain('complex');
    });

    it('should provide default reason when no indicator found', () => {
      // Use a task description without any trigger words
      const reason = getComplexityReason('Frobulate the quantum flux', 'complex');
      expect(reason).toContain('default');
    });
  });
});
